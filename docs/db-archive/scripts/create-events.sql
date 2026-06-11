create table if not exists events (
    event_id bigserial primary key,
    title varchar(180) not null,
    description text,
    event_date date not null,
    event_time time,
    event_type varchar(40) not null,
    target_type varchar(40) not null,
    target_department_id integer references departments(department_id),
    target_job_title varchar(120),
    target_employee_ids text,
    created_by_employee_id integer references employees(employee_id),
    created_by_name varchar(180),
    created_by_role varchar(120),
    annule boolean not null default false,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create index if not exists idx_events_event_date on events(event_date);
create index if not exists idx_events_target_type on events(target_type);
create index if not exists idx_events_creator on events(created_by_employee_id);
