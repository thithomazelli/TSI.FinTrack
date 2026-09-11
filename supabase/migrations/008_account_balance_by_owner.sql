-- Per-account available (realized) + projected balance using explicit owner_id.
-- Returns kind ('checking' | 'savings') so callers can group by type.
-- Safe for Edge Functions running with the service role key.
create or replace function get_account_balances_by_owner(p_owner_id uuid, end_date date)
returns table(account_id uuid, account_name text, kind text, available numeric, projected numeric)
language sql security definer
as $$
  select
    a.id as account_id,
    a.name as account_name,
    coalesce(a.kind, 'checking') as kind,
    -- realized only
    a.balance
      + coalesce((select sum(e.amount) from entries e
                  where e.owner_id = p_owner_id and e.account_id = a.id and e.status = 'REALIZED'), 0)
      - coalesce((select sum(t.amount) from transactions t
                  where t.owner_id = p_owner_id and t.account_id = a.id and t.status = 'REALIZED'), 0)
    as available,
    -- all statuses up to end_date
    a.balance
      + coalesce((select sum(e.amount) from entries e
                  where e.owner_id = p_owner_id and e.account_id = a.id and e.date <= end_date), 0)
      - coalesce((select sum(t.amount) from transactions t
                  where t.owner_id = p_owner_id and t.account_id = a.id and t.date <= end_date), 0)
    as projected
  from accounts a
  where a.owner_id = p_owner_id and not a.is_archived
  order by a.kind, a.name;
$$;

-- Drop old split RPCs if they exist
drop function if exists get_account_projected_balances_by_owner(uuid, date);
