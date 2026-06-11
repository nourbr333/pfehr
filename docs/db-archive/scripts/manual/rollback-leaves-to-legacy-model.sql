begin;

drop trigger if exists trg_sync_leave_balances_days_taken on leaves;
drop trigger if exists trg_set_leaves_updated_at on leaves;

drop function if exists sync_leave_balances_days_taken();
drop function if exists recompute_leave_balance_days_taken(integer, bigint, integer);
drop function if exists leave_days_overlap_in_year(date, date, integer);
drop function if exists set_leaves_updated_at();

drop table if exists leave_balances;
drop table if exists leaves;
drop table if exists leave_types;

-- Restore the previous leaves table when the backup exists.
do $$
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = current_schema()
          and table_name = 'leaves_legacy'
    ) then
        execute 'alter table leaves_legacy rename to leaves';
    end if;
end
$$;

commit;
