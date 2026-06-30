-- Saldo realmente disponível (acumulado, todo o histórico):
--   saldo inicial das contas ativas
--   + entradas REALIZADAS de todos os meses
--   − transações REALIZADAS de todos os meses
-- Assim, superávits/déficits de meses anteriores são carregados.

create or replace function available_balance(uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(balance) from accounts
              where owner_id = uid and not is_archived), 0)
    + coalesce((select sum(amount) from entries
                where owner_id = uid and status = 'REALIZED'), 0)
    - coalesce((select sum(amount) from transactions
                where owner_id = uid and status = 'REALIZED'), 0)
$$;
