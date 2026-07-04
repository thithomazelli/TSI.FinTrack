-- Variante de get_balance_up_to que recebe owner_id explicitamente.
-- Usada por Edge Functions que rodam com service_role (auth.uid() = null).
create or replace function get_balance_up_to_by_owner(p_owner_id uuid, end_date date)
returns numeric
language sql
security definer
stable
as $$
  select
    coalesce((select sum(a.balance) from accounts a
              where a.owner_id = p_owner_id and not a.is_archived), 0)
    + coalesce((select sum(e.amount) from entries e
                where e.owner_id = p_owner_id and e.date <= end_date), 0)
    - coalesce((select sum(t.amount) from transactions t
                where t.owner_id = p_owner_id and t.date <= end_date), 0)
$$;
