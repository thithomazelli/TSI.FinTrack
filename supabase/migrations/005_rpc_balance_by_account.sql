-- Cumulative REALIZED balance for one account (equivalent to v_available_balance but per-account).
create or replace function get_available_balance_by_account(p_account_id uuid)
returns numeric
language sql security definer
as $$
  select coalesce(
    (select balance from accounts where id = p_account_id and owner_id = auth.uid())
    + (select coalesce(sum(amount), 0) from entries      where owner_id = auth.uid() and account_id = p_account_id and status = 'REALIZED')
    - (select coalesce(sum(amount), 0) from transactions where owner_id = auth.uid() and account_id = p_account_id and status = 'REALIZED'),
    0
  );
$$;

-- Cumulative all-status balance for one account up to a given date (equivalent to get_balance_up_to but per-account).
create or replace function get_balance_up_to_by_account(p_account_id uuid, p_end_date date)
returns numeric
language sql security definer
as $$
  select coalesce(
    (select balance from accounts where id = p_account_id and owner_id = auth.uid())
    + (select coalesce(sum(amount), 0) from entries      where owner_id = auth.uid() and account_id = p_account_id and date <= p_end_date)
    - (select coalesce(sum(amount), 0) from transactions where owner_id = auth.uid() and account_id = p_account_id and date <= p_end_date),
    0
  );
$$;
