-- Função RPC: saldo acumulado (realized + projected) até uma data específica.
-- Substitui o cálculo client-side limitado a 1000 linhas do PostgREST.
-- security invoker: respeita RLS das tabelas-base (auth.uid()).
create or replace function get_balance_up_to(end_date date)
returns numeric
language sql
security invoker
stable
as $$
  select
    coalesce((select sum(a.balance) from accounts a
              where a.owner_id = auth.uid() and not a.is_archived), 0)
    + coalesce((select sum(e.amount) from entries e
                where e.owner_id = auth.uid() and e.date <= end_date), 0)
    - coalesce((select sum(t.amount) from transactions t
                where t.owner_id = auth.uid() and t.date <= end_date), 0)
$$;
