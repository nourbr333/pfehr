create table if not exists employee_communication_profiles (
    employee_id integer primary key references employees(employee_id) on delete cascade,
    team_label varchar(120),
    site_label varchar(120),
    project_label varchar(120),
    role_label varchar(120)
);

insert into employee_communication_profiles (employee_id, team_label, role_label)
select e.employee_id, d.department_name, e.job_title
from employees e
left join departments d on d.department_id = e.department_id
on conflict (employee_id) do nothing;

create table if not exists communication_announcements (
    announcement_id bigserial primary key,
    manager_id integer not null references employees(employee_id) on delete cascade,
    title varchar(180) not null,
    message text not null,
    priority varchar(20) not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
    target_team varchar(120),
    target_role varchar(120),
    target_site varchar(120),
    target_project varchar(120),
    requires_acknowledgement boolean not null default false,
    auto_reminder_enabled boolean not null default true,
    scheduled_for timestamp,
    published_at timestamp,
    expires_at timestamp,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create index if not exists idx_comm_announcement_manager_created
    on communication_announcements(manager_id, created_at desc);

create index if not exists idx_comm_announcement_manager_published
    on communication_announcements(manager_id, published_at desc);

create table if not exists communication_read_receipts (
    receipt_id bigserial primary key,
    announcement_id bigint not null references communication_announcements(announcement_id) on delete cascade,
    employee_id integer not null references employees(employee_id) on delete cascade,
    first_viewed_at timestamp,
    acknowledged_at timestamp,
    reminder_count integer not null default 0,
    last_reminder_at timestamp,
    unique (announcement_id, employee_id)
);

create index if not exists idx_comm_receipts_announcement
    on communication_read_receipts(announcement_id);

create index if not exists idx_comm_receipts_employee
    on communication_read_receipts(employee_id);

create table if not exists communication_reactions (
    reaction_id bigserial primary key,
    announcement_id bigint not null references communication_announcements(announcement_id) on delete cascade,
    employee_id integer not null references employees(employee_id) on delete cascade,
    reaction_type varchar(30) not null,
    reacted_at timestamp not null default now()
);

create index if not exists idx_comm_reactions_announcement
    on communication_reactions(announcement_id);

create table if not exists communication_comments (
    comment_id bigserial primary key,
    announcement_id bigint not null references communication_announcements(announcement_id) on delete cascade,
    employee_id integer not null references employees(employee_id) on delete cascade,
    comment_text text not null,
    is_useful boolean not null default false,
    created_at timestamp not null default now()
);

create index if not exists idx_comm_comments_announcement
    on communication_comments(announcement_id);

create table if not exists communication_faq_questions (
    question_id bigserial primary key,
    manager_id integer not null references employees(employee_id) on delete cascade,
    employee_id integer references employees(employee_id),
    question_text text not null,
    status varchar(20) not null default 'open' check (status in ('open', 'converted', 'closed')),
    created_at timestamp not null default now(),
    converted_at timestamp
);

create index if not exists idx_comm_faq_questions_manager
    on communication_faq_questions(manager_id, status, created_at desc);

create table if not exists communication_faq_entries (
    faq_id bigserial primary key,
    manager_id integer not null references employees(employee_id) on delete cascade,
    source_question_id bigint references communication_faq_questions(question_id) on delete set null,
    question_title varchar(220) not null,
    answer_text text not null,
    tags varchar(220),
    validated_by integer references employees(employee_id),
    views_count integer not null default 0,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create index if not exists idx_comm_faq_entries_manager
    on communication_faq_entries(manager_id, views_count desc, updated_at desc);
