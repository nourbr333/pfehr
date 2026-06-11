create table if not exists absence_requests (
    request_id bigserial primary key,
    employee_id integer not null references employees(employee_id) on delete cascade,
    manager_id integer not null references employees(employee_id) on delete cascade,
    absence_type varchar(30) not null check (absence_type in ('conge-paye', 'maladie', 'sans-solde', 'evenement-familial', 'autre')),
    status varchar(20) not null check (status in ('en_attente', 'approuvee', 'refusee')),
    start_date date not null,
    end_date date not null,
    reason text,
    requested_at timestamp not null default now(),
    decided_at timestamp,
    decided_by integer references employees(employee_id),
    continuity_required boolean not null default false,
    check (end_date >= start_date)
);

create index if not exists idx_absence_requests_manager_period
    on absence_requests(manager_id, start_date, end_date);

create index if not exists idx_absence_requests_employee_status
    on absence_requests(employee_id, status);

create table if not exists employee_coverage_profiles (
    employee_id integer primary key references employees(employee_id) on delete cascade,
    critical_role boolean not null default false,
    role_label varchar(120),
    backup_employee_id integer references employees(employee_id)
);

create table if not exists continuity_plans (
    plan_id bigserial primary key,
    manager_id integer not null references employees(employee_id) on delete cascade,
    request_id integer not null references leave_requests(id) on delete cascade,
    employee_id integer not null references employees(employee_id) on delete cascade,
    backup_employee_id integer references employees(employee_id),
    plan_status varchar(30) not null default 'created',
    notes text,
    created_at timestamp not null default now()
);

create index if not exists idx_continuity_plans_manager
    on continuity_plans(manager_id, created_at desc);
