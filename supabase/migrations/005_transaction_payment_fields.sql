-- Adiciona campos de data de pagamento e método de pagamento nas transações
alter table transactions
  add column if not exists payment_date date,
  add column if not exists payment_method text check (payment_method in ('PIX', 'DEBIT', 'CREDIT'));

-- Popula payment_date retroativamente: débito = mesma data, crédito = data da transação
update transactions
  set payment_method = case
    when credit_card_id is not null then 'CREDIT'
    else 'DEBIT'
  end,
  payment_date = date
  where payment_date is null;
