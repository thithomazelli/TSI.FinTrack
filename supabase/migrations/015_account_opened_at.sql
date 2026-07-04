-- Adiciona data de abertura da conta para uso no cálculo de saldo por período.
-- Default null = conta sem data de abertura definida (saldo inicial nunca entra no range).
alter table accounts add column if not exists opened_at date null;

-- Função RPC: saldo acumulado dentro de um intervalo.
-- Inclui accounts.balance apenas das contas cuja opened_at cai dentro do período.
create or replace function get_balance_in_range(start_date date, end_date date)
returns numeric
language sql
security invoker
stable
as $$
  select
    coalesce((
      select sum(a.balance) from accounts a
      where a.owner_id = auth.uid()
        and not a.is_archived
        and a.opened_at >= start_date
        and a.opened_at <= end_date
    ), 0)
    + coalesce((
      select sum(e.amount) from entries e
      where e.owner_id = auth.uid()
        and e.date >= start_date and e.date <= end_date
    ), 0)
    - coalesce((
      select sum(t.amount) from transactions t
      where t.owner_id = auth.uid()
        and t.date >= start_date and t.date <= end_date
    ), 0)
$$;
