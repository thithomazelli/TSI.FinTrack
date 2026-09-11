-- Per-account available (realized) balance using explicit owner_id.
-- Safe for Edge Functions running with the service role key.
create or replace function get_account_balances_by_owner(p_owner_id uuid)
returns table(account_id uuid, account_name text, available numeric)
language sql security definer
as $$
  select
    a.id as account_id,
    a.name as account_name,
    a.balance
      + coalesce((select sum(e.amount) from entries e
                  where e.owner_id = p_owner_id and e.account_id = a.id and e.status = 'REALIZED'), 0)
      - coalesce((select sum(t.amount) from transactions t
                  where t.owner_id = p_owner_id and t.account_id = a.id and t.status = 'REALIZED'), 0)
    as available
  from accounts a
  where a.owner_id = p_owner_id and not a.is_archived
  order by a.name;
$$;

-- Per-account projected balance up to a date using explicit owner_id.
-- Includes all statuses (REALIZED, PROJECTED, ESTIMATED).
create or replace function get_account_projected_balances_by_owner(p_owner_id uuid, end_date date)
returns table(account_id uuid, account_name text, projected numeric)
language sql security definer
as $$
  select
    a.id as account_id,
    a.name as account_name,
    a.balance
      + coalesce((select sum(e.amount) from entries e
                  where e.owner_id = p_owner_id and e.account_id = a.id and e.date <= end_date), 0)
      - coalesce((select sum(t.amount) from transactions t
                  where t.owner_id = p_owner_id and t.account_id = a.id and t.date <= end_date), 0)
    as projected
  from accounts a
  where a.owner_id = p_owner_id and not a.is_archived
  order by a.name;
$$;
