-- Per-account available + projected balance, handling savings accounts correctly.
-- Savings accounts use savings_movements (DEPOSIT/WITHDRAWAL via domain_lists).
-- Checking accounts use entries (income) and transactions (expenses).
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
    case when coalesce(a.kind, 'checking') = 'savings' then
      -- Savings: initial balance + deposits - withdrawals (all time = realized)
      a.balance + coalesce((
        select sum(case when dl.value = 'DEPOSIT' then sm.amount else -sm.amount end)
        from savings_movements sm
        join domain_lists dl on dl.id = sm.type_id
        where sm.owner_id = p_owner_id and sm.account_id = a.id
      ), 0)
    else
      -- Checking: initial balance + realized entries - realized transactions
      a.balance
        + coalesce((select sum(e.amount) from entries e
                    where e.owner_id = p_owner_id and e.account_id = a.id and e.status = 'REALIZED'), 0)
        - coalesce((select sum(t.amount) from transactions t
                    where t.owner_id = p_owner_id and t.account_id = a.id and t.status = 'REALIZED'), 0)
    end as available,
    case when coalesce(a.kind, 'checking') = 'savings' then
      -- Savings projected: same as available (savings movements have no pending status)
      a.balance + coalesce((
        select sum(case when dl.value = 'DEPOSIT' then sm.amount else -sm.amount end)
        from savings_movements sm
        join domain_lists dl on dl.id = sm.type_id
        where sm.owner_id = p_owner_id and sm.account_id = a.id and sm.date <= end_date
      ), 0)
    else
      -- Checking projected: initial balance + all entries - all transactions up to end_date
      a.balance
        + coalesce((select sum(e.amount) from entries e
                    where e.owner_id = p_owner_id and e.account_id = a.id and e.date <= end_date), 0)
        - coalesce((select sum(t.amount) from transactions t
                    where t.owner_id = p_owner_id and t.account_id = a.id and t.date <= end_date), 0)
    end as projected
  from accounts a
  where a.owner_id = p_owner_id and not a.is_archived
  order by a.kind, a.name;
$$;

drop function if exists get_account_projected_balances_by_owner(uuid, date);

-- Period net balance by account kind (mirrors get_balance_in_range but per kind, with owner_id).
-- Returns net flow for checking and savings separately within the given date range.
create or replace function get_period_balance_by_kind(p_owner_id uuid, start_date date, end_date date)
returns table(kind text, period_balance numeric)
language sql security definer
as $$
  select
    coalesce(a.kind, 'checking') as kind,
    -- initial balance of accounts opened in this period
    coalesce(sum(case when a.opened_at >= start_date and a.opened_at <= end_date then a.balance else 0 end), 0)
    + case when coalesce(a.kind, 'checking') = 'savings' then
        -- savings: deposits - withdrawals in period
        coalesce((
          select sum(case when dl.value = 'DEPOSIT' then sm.amount else -sm.amount end)
          from savings_movements sm
          join domain_lists dl on dl.id = sm.type_id
          where sm.owner_id = p_owner_id and sm.account_id = a.id
            and sm.date >= start_date and sm.date <= end_date
        ), 0)
      else
        -- checking: entries - transactions in period (all statuses)
        coalesce((select sum(e.amount) from entries e
                  where e.owner_id = p_owner_id and e.account_id = a.id
                    and e.date >= start_date and e.date <= end_date), 0)
        - coalesce((select sum(t.amount) from transactions t
                    where t.owner_id = p_owner_id and t.account_id = a.id
                      and t.date >= start_date and t.date <= end_date), 0)
    end as period_balance
  from accounts a
  where a.owner_id = p_owner_id and not a.is_archived
  group by coalesce(a.kind, 'checking');
$$;
