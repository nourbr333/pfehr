begin;

-- script d'initialisation minimale pour tester visuellement la page
-- absences avancees en moins de 2 minutes.
-- prerequis:
-- 1) les tables du script create-manager-advanced-absences.sql existent
-- 2) au moins un manager et quelques employes rattaches a ce manager existent.

-- manager cible:
-- priorite au manager #9 (coherent avec le reste du projet),
-- sinon fallback sur le premier manager detecte.
with selected_manager as (
    select e.employee_id as manager_id
    from employees e
    where e.employee_id = 9
    union all
    select distinct e.manager_id
    from employees e
    where e.manager_id is not null
      and not exists (
          select 1
          from employees x
          where x.employee_id = 9
      )
    limit 1
),
team as (
    select
        e.employee_id,
        e.manager_id,
        e.job_title,
        row_number() over (order by e.employee_id) as rn
    from employees e
    join selected_manager sm on sm.manager_id = e.manager_id
),
candidate_backup as (
    select t.employee_id
    from team t
    where t.rn = 2
)
insert into employee_coverage_profiles (
    employee_id,
    critical_role,
    role_label,
    backup_employee_id
)
select
    t.employee_id,
    case when t.rn in (1, 3) then true else false end as critical_role,
    coalesce(nullif(trim(t.job_title), ''), 'role non defini') as role_label,
    (select cb.employee_id from candidate_backup cb)
from team t
where t.rn <= 4
on conflict (employee_id) do update
set
    critical_role = excluded.critical_role,
    role_label = excluded.role_label,
    backup_employee_id = excluded.backup_employee_id;

with selected_manager as (
    select e.employee_id as manager_id
    from employees e
    where e.employee_id = 9
    union all
    select distinct e.manager_id
    from employees e
    where e.manager_id is not null
      and not exists (
          select 1
          from employees x
          where x.employee_id = 9
      )
    limit 1
),
team as (
    select
        e.employee_id,
        e.manager_id,
        row_number() over (order by e.employee_id) as rn
    from employees e
    join selected_manager sm on sm.manager_id = e.manager_id
),
requests_to_insert as (
    -- 1) demande approuvee: conges
    select
        t.employee_id,
        t.manager_id,
        'conges'::varchar(20) as absence_type,
        'approuvee'::varchar(20) as status,
        (current_date + 1) as start_date,
        (current_date + 3) as end_date,
        'vacances familiales'::text as reason,
        (now() - interval '3 day') as requested_at,
        (now() - interval '2 day') as decided_at,
        t.manager_id as decided_by,
        false as continuity_required
    from team t
    where t.rn = 1

    union all

    -- 2) demande approuvee: maladie (role critique probable)
    select
        t.employee_id,
        t.manager_id,
        'maladie'::varchar(20),
        'approuvee'::varchar(20),
        (current_date + 2),
        (current_date + 4),
        'arret medical'::text,
        (now() - interval '2 day'),
        (now() - interval '1 day'),
        t.manager_id,
        true
    from team t
    where t.rn = 3

    union all

    -- 3) demande en attente: rtt
    select
        t.employee_id,
        t.manager_id,
        'rtt'::varchar(20),
        'en_attente'::varchar(20),
        (current_date + 7),
        (current_date + 7),
        'journee rtt'::text,
        now(),
        null::timestamp,
        null::integer,
        false
    from team t
    where t.rn = 2

    union all

    -- 4) demande refusee: teletravail
    select
        t.employee_id,
        t.manager_id,
        'teletravail'::varchar(20),
        'refusee'::varchar(20),
        (current_date + 1),
        (current_date + 1),
        'teletravail exceptionnel'::text,
        (now() - interval '1 day'),
        now(),
        t.manager_id,
        false
    from team t
    where t.rn = 4
)
insert into absence_requests (
    employee_id,
    manager_id,
    absence_type,
    status,
    start_date,
    end_date,
    reason,
    requested_at,
    decided_at,
    decided_by,
    continuity_required
)
select
    r.employee_id,
    r.manager_id,
    r.absence_type,
    r.status,
    r.start_date,
    r.end_date,
    r.reason,
    r.requested_at,
    r.decided_at,
    r.decided_by,
    r.continuity_required
from requests_to_insert r
where not exists (
    select 1
    from absence_requests ar
    where ar.employee_id = r.employee_id
      and ar.manager_id = r.manager_id
      and ar.absence_type = r.absence_type
      and ar.status = r.status
      and ar.start_date = r.start_date
      and ar.end_date = r.end_date
);

commit;

-- verification rapide:
-- select * from employee_coverage_profiles order by employee_id;
-- select request_id, employee_id, manager_id, absence_type, status, start_date, end_date
-- from absence_requests
-- order by request_id desc
-- limit 20;
