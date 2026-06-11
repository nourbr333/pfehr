begin;

-- 1) Leave types master table
create table if not exists leave_types (
    id bigint generated always as identity primary key,
    name varchar(100) not null unique,
    max_days_per_year integer not null check (max_days_per_year >= 0),
    requires_justification boolean not null default false,
    is_active boolean not null default true
);

-- 2) Replace/reshape leaves table
-- Keep a backup of the existing table if present and not already migrated.
do $$
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = current_schema()
          and table_name = 'leaves'
    )
    and not exists (
        select 1
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'leaves'
          and column_name = 'leave_type_id'
    ) then
        execute 'alter table leaves rename to leaves_legacy';
    end if;
end
$$;

create table if not exists leaves (
    leave_id bigint generated always as identity primary key,
    employee_id integer not null references employees(employee_id) on delete cascade,
    leave_type_id bigint not null references leave_types(id),
    start_date date not null,
    end_date date not null,
    days_requested integer generated always as ((end_date - start_date) + 1) stored,
    status varchar(20) not null default 'approved' check (status in ('approved', 'cancelled')),
    notes text,
    -- Qui a saisi la ligne (manager / RH). Pas de table users dans ce projet : on référence employees.
    entered_by integer not null references employees(employee_id),
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    check (end_date >= start_date)
);

create index if not exists idx_leaves_employee_dates
    on leaves(employee_id, start_date, end_date);

create index if not exists idx_leaves_type_status
    on leaves(leave_type_id, status);

-- Maintain updated_at automatically
create or replace function set_leaves_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_set_leaves_updated_at on leaves;
create trigger trg_set_leaves_updated_at
before update on leaves
for each row
execute function set_leaves_updated_at();

-- 3) Leave balances
create table if not exists leave_balances (
    id bigint generated always as identity primary key,
    employee_id integer not null references employees(employee_id) on delete cascade,
    leave_type_id bigint not null references leave_types(id),
    year integer not null check (year between 1900 and 3000),
    total_allocated numeric(7,2) not null check (total_allocated >= 0),
    days_taken numeric(7,2) not null default 0,
    days_remaining numeric(7,2) generated always as (total_allocated - days_taken) stored,
    unique (employee_id, leave_type_id, year)
);

create index if not exists idx_leave_balances_employee_year
    on leave_balances(employee_id, year);

-- 4) Trigger logic to auto-sync leave_balances.days_taken
create or replace function leave_days_overlap_in_year(
    p_start_date date,
    p_end_date date,
    p_year integer
)
returns numeric
language sql
immutable
as $$
    select case
        when p_end_date < make_date(p_year, 1, 1)
          or p_start_date > make_date(p_year, 12, 31) then 0
        else (least(p_end_date, make_date(p_year, 12, 31))
              - greatest(p_start_date, make_date(p_year, 1, 1)) + 1)::numeric
    end;
$$;

create or replace function recompute_leave_balance_days_taken(
    p_employee_id integer,
    p_leave_type_id bigint,
    p_year integer
)
returns void
language plpgsql
as $$
begin
    insert into leave_balances (employee_id, leave_type_id, year, total_allocated, days_taken)
    values (p_employee_id, p_leave_type_id, p_year, 0, 0)
    on conflict (employee_id, leave_type_id, year) do nothing;

    update leave_balances lb
    set days_taken = coalesce((
        select sum(leave_days_overlap_in_year(l.start_date, l.end_date, p_year))
        from leaves l
        where l.employee_id = p_employee_id
          and l.leave_type_id = p_leave_type_id
          and l.status = 'approved'
    ), 0)
    where lb.employee_id = p_employee_id
      and lb.leave_type_id = p_leave_type_id
      and lb.year = p_year;
end;
$$;

create or replace function sync_leave_balances_days_taken()
returns trigger
language plpgsql
as $$
declare
    y integer;
    y_start integer;
    y_end integer;
begin
    if tg_op in ('INSERT', 'UPDATE') then
        y_start := extract(year from new.start_date)::integer;
        y_end := extract(year from new.end_date)::integer;
        for y in y_start..y_end loop
            perform recompute_leave_balance_days_taken(new.employee_id, new.leave_type_id, y);
        end loop;
    end if;

    if tg_op in ('DELETE', 'UPDATE') then
        y_start := extract(year from old.start_date)::integer;
        y_end := extract(year from old.end_date)::integer;
        for y in y_start..y_end loop
            perform recompute_leave_balance_days_taken(old.employee_id, old.leave_type_id, y);
        end loop;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_sync_leave_balances_days_taken on leaves;
create trigger trg_sync_leave_balances_days_taken
after insert or update or delete on leaves
for each row
execute function sync_leave_balances_days_taken();

commit;
