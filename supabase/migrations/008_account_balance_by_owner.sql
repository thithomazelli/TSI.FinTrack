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
