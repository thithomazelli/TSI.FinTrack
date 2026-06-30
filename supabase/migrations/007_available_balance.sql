-- Saldo realmente disponível (acumulado, todo o histórico), exposto como VIEW
-- para ficar acessível tanto ao app quanto às notificações, com uma única
-- fonte de verdade.
--
-- Decisões de arquitetura:
--  • VIEW (não MATERIALIZED VIEW): saldo financeiro muda a cada lançamento;
--    uma materialized view ficaria desatualizada e exigiria refresh. A view
--    recalcula na hora, e com índices o custo é mínimo.
--  • security_invoker = on: a view respeita a RLS das tabelas-base, então
--    cada usuário só enxerga o próprio saldo (sem passar uid manualmente,
--    eliminando o risco de vazar saldo de terceiros).

-- Índices para acelerar os SUMs por usuário/status
create index if not exists idx_entries_owner_status on entries (owner_id, status);
create index if not exists idx_transactions_owner_status on transactions (owner_id, status);
create index if not exists idx_accounts_owner on accounts (owner_id) where not is_archived;

create or replace view v_available_balance
with (security_invoker = on) as
select
  p.id as owner_id,
  coalesce((select sum(a.balance) from accounts a
            where a.owner_id = p.id and not a.is_archived), 0)
  + coalesce((select sum(e.amount) from entries e
              where e.owner_id = p.id and e.status = 'REALIZED'), 0)
  - coalesce((select sum(t.amount) from transactions t
              where t.owner_id = p.id and t.status = 'REALIZED'), 0)
  as available
from user_profiles p;
