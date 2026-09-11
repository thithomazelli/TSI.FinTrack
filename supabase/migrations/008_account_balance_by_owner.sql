-- Per-account available + projected balance with correct savings handling.
-- Savings accounts use: initial_balance + savings_movements_net + realized entries - realized transactions
-- Checking accounts use: initial_balance + realized entries - realized transactions
-- Safe for Edge Functions running with the service role key.
create or replace function get_account_balances_by_owner(p_owner_id uuid, end_date date)
returns table(account_id uuid, account_name text, kind text, available numeric, projected numeric)
language sql security definer
as $$
  select
    a.id,
    a.name,
    coalesce(a.kind, 'checking'),
    -- available (realized only)
    a.balance
    + coalesce((
        select sum(case when dl.value = 'DEPOSIT' then sm.amount else -sm.amount end)
        from savings_movements sm join domain_lists dl on dl.id = sm.type_id
        where sm.owner_id = p_owner_id and sm.account_id = a.id
      ), 0)
    + coalesce((select sum(e.amount) from entries e
                where e.owner_id = p_owner_id and e.account_id = a.id and e.status = 'REALIZED'), 0)
    - coalesce((select sum(t.amount) from transactions t
                where t.owner_id = p_owner_id and t.account_id = a.id and t.status = 'REALIZED'), 0),
    -- projected (all statuses up to end_date)
    a.balance
    + coalesce((
        select sum(case when dl.value = 'DEPOSIT' then sm.amount else -sm.amount end)
        from savings_movements sm join domain_lists dl on dl.id = sm.type_id
        where sm.owner_id = p_owner_id and sm.account_id = a.id and sm.date <= end_date
      ), 0)
    + coalesce((select sum(e.amount) from entries e
                where e.owner_id = p_owner_id and e.account_id = a.id and e.date <= end_date), 0)
    - coalesce((select sum(t.amount) from transactions t
                where t.owner_id = p_owner_id and t.account_id = a.id and t.date <= end_date), 0)
  from accounts a
  where a.owner_id = p_owner_id and not a.is_archived
  order by a.kind, a.name;
$$;

drop function if exists get_account_projected_balances_by_owner(uuid, date);

-- Period net balance by account kind (mirrors the app's Período card).
-- Uses a subquery per account then aggregates by kind to avoid GROUP BY issues.
create or replace function get_period_balance_by_kind(p_owner_id uuid, start_date date, end_date date)
returns table(kind text, period_balance numeric)
language sql security definer
as $$
  select kind, sum(net) from (
    select
      coalesce(a.kind, 'checking') as kind,
      -- initial balance of accounts opened in this period
      case when a.opened_at >= start_date and a.opened_at <= end_date then a.balance else 0 end
      + coalesce((
          select sum(case when dl.value = 'DEPOSIT' then sm.amount else -sm.amount end)
          from savings_movements sm join domain_lists dl on dl.id = sm.type_id
          where sm.owner_id = p_owner_id and sm.account_id = a.id
            and sm.date >= start_date and sm.date <= end_date
        ), 0)
      + coalesce((select sum(e.amount) from entries e
                  where e.owner_id = p_owner_id and e.account_id = a.id
                    and e.date >= start_date and e.date <= end_date), 0)
      - coalesce((select sum(t.amount) from transactions t
                  where t.owner_id = p_owner_id and t.account_id = a.id
                    and t.date >= start_date and t.date <= end_date), 0)
      as net
    from accounts a
    where a.owner_id = p_owner_id and not a.is_archived
  ) sub
  group by kind;
$$;
