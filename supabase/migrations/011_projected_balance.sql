-- Saldo projetado acumulado (realized + projected), exposto como VIEW
create or replace view v_projected_balance
with (security_invoker = on) as
select
  p.id as owner_id,
  coalesce((select sum(a.balance) from accounts a
            where a.owner_id = p.id and not a.is_archived), 0)
  + coalesce((select sum(e.amount) from entries e
              where e.owner_id = p.id), 0)
  - coalesce((select sum(t.amount) from transactions t
              where t.owner_id = p.id), 0)
  as projected
from user_profiles p;
