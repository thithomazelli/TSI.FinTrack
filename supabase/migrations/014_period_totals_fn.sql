-- Totais de entradas e saídas para um período, calculados server-side.
-- Evita o limite de 1000 linhas do PostgREST no cliente.
-- Soma todos os registros do período independente de status.
create or replace function get_period_totals(start_date date, end_date date)
returns table(total_entries numeric, total_transactions numeric)
language sql
security invoker
stable
as $$
  select
    coalesce((select sum(e.amount) from entries e
              where e.owner_id = auth.uid()
                and e.date >= start_date and e.date <= end_date), 0),
    coalesce((select sum(t.amount) from transactions t
              where t.owner_id = auth.uid()
                and t.date >= start_date and t.date <= end_date), 0)
$$;
