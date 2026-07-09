-- =============================================
-- EXTENSIONS
-- =============================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- =============================================
-- VIEWS
-- =============================================

-- Available balance (realized only)
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

-- Projected balance (all records regardless of status)
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

-- =============================================
-- FUNCTIONS
-- =============================================

-- Accumulated balance (realized + projected) up to a specific date
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

-- Period totals (entries and transactions) for a date range
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

-- Balance within a date range (accounts opened in range + entries - transactions)
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

-- Balance up to a date by explicit owner_id (for Edge Functions with service_role)
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

-- Recalculate a credit card bill's total_amount from its transactions
create or replace function recalculate_bill_total(
  p_credit_card_id uuid,
  p_year integer,
  p_month integer,
  p_owner_id uuid
) returns void as $$
begin
  update credit_card_bills
  set total_amount = (
    select coalesce(sum(amount), 0)
    from transactions
    where credit_card_id = p_credit_card_id
      and extract(year  from date::date) = p_year
      and extract(month from date::date) = p_month
      and owner_id = p_owner_id
  ),
  updated_at = now()
  where credit_card_id = p_credit_card_id
    and year  = p_year
    and month = p_month
    and owner_id = p_owner_id;
end;
$$ language plpgsql;

-- Trigger function: keep bill total in sync with transactions
create or replace function trg_fn_update_bill_total() returns trigger as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.credit_card_id is not null then
    perform recalculate_bill_total(
      new.credit_card_id,
      extract(year  from new.date)::integer,
      extract(month from new.date)::integer,
      new.owner_id
    );
  end if;

  if tg_op = 'UPDATE' and old.credit_card_id is not null and (
    old.credit_card_id is distinct from new.credit_card_id or
    old.date            is distinct from new.date
  ) then
    perform recalculate_bill_total(
      old.credit_card_id,
      extract(year  from old.date)::integer,
      extract(month from old.date)::integer,
      old.owner_id
    );
  end if;

  if tg_op = 'DELETE' and old.credit_card_id is not null then
    perform recalculate_bill_total(
      old.credit_card_id,
      extract(year  from old.date)::integer,
      extract(month from old.date)::integer,
      old.owner_id
    );
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql;

-- Per-user seed data (called by handle_new_user trigger)
create or replace function seed_user_defaults(p_owner_id uuid)
returns void language plpgsql as $$
begin

  -- Domain lists: transaction_status
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'transaction_status', 'Realizado', 'REALIZED', true, true, 1),
    (p_owner_id, 'transaction_status', 'Projetado', 'PROJECTED', true, false, 2)
  on conflict do nothing;

  -- Domain lists: transaction_type
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'transaction_type', 'Débito', 'DEBIT', true, true, 1),
    (p_owner_id, 'transaction_type', 'Crédito', 'CREDIT', true, false, 2)
  on conflict do nothing;

  -- Domain lists: entry_type
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'entry_type', 'Salário', 'SALARY', false, true, 1),
    (p_owner_id, 'entry_type', 'Reembolso', 'REIMBURSEMENT', false, false, 2),
    (p_owner_id, 'entry_type', 'Transferência', 'TRANSFER', false, false, 3),
    (p_owner_id, 'entry_type', 'Outro', 'OTHER', false, false, 4)
  on conflict do nothing;

  -- Domain lists: account_type
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'account_type', 'Conta Corrente', 'CHECKING', true, true, 1),
    (p_owner_id, 'account_type', 'Poupança', 'SAVINGS', true, false, 2)
  on conflict do nothing;

  -- Domain lists: savings_movement_type
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'savings_movement_type', 'Depósito', 'DEPOSIT', true, true, 1),
    (p_owner_id, 'savings_movement_type', 'Resgate', 'WITHDRAWAL', true, false, 2)
  on conflict do nothing;

  -- Domain lists: bill_status
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'bill_status', 'Aberta', 'OPEN', true, true, 1),
    (p_owner_id, 'bill_status', 'Fechada', 'CLOSED', true, false, 2),
    (p_owner_id, 'bill_status', 'Paga', 'PAID', true, false, 3)
  on conflict do nothing;

  -- Default categories
  insert into categories (owner_id, name, color) values
    (p_owner_id, 'Alimentação/Mercado', '#f59e0b'),
    (p_owner_id, 'Assinaturas', '#8b5cf6'),
    (p_owner_id, 'Bike', '#10b981'),
    (p_owner_id, 'Celular', '#6366f1'),
    (p_owner_id, 'Combustível', '#f97316'),
    (p_owner_id, 'Convênio Médico', '#ec4899'),
    (p_owner_id, 'Cuidados Pessoais', '#f43f5e'),
    (p_owner_id, 'Despesas Carro', '#78716c'),
    (p_owner_id, 'Despesas Casa', '#84cc16'),
    (p_owner_id, 'Despesas Empresa', '#0ea5e9'),
    (p_owner_id, 'Despesas Terreno', '#a3e635'),
    (p_owner_id, 'Diversos', '#6b7280'),
    (p_owner_id, 'Empréstimo Bancário', '#dc2626'),
    (p_owner_id, 'Empréstimo Pessoal', '#b91c1c'),
    (p_owner_id, 'Enxoval', '#db2777'),
    (p_owner_id, 'Estudo', '#2563eb'),
    (p_owner_id, 'Farmácia', '#16a34a'),
    (p_owner_id, 'Futebol', '#15803d'),
    (p_owner_id, 'Games', '#7c3aed'),
    (p_owner_id, 'Instrumentos', '#b45309'),
    (p_owner_id, 'Investimentos', '#0d9488'),
    (p_owner_id, 'Lazer', '#d97706'),
    (p_owner_id, 'Médico', '#059669'),
    (p_owner_id, 'Parcela carro', '#475569'),
    (p_owner_id, 'Pets', '#92400e'),
    (p_owner_id, 'Poupança', '#065f46'),
    (p_owner_id, 'Presente', '#be185d'),
    (p_owner_id, 'Roupas', '#9333ea'),
    (p_owner_id, 'TI', '#1d4ed8'),
    (p_owner_id, 'Tarifas/Juros', '#991b1b'),
    (p_owner_id, 'Telefone celular', '#0369a1'),
    (p_owner_id, 'Transporte Público', '#1e40af'),
    (p_owner_id, 'Tênis', '#7e22ce'),
    (p_owner_id, 'Uber/99', '#1c1917'),
    (p_owner_id, 'Viagem', '#0891b2')
  on conflict do nothing;

end;
$$;

-- Create profile and seed defaults when a new user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  perform seed_user_defaults(new.id);
  return new;
end;
$$;

-- =============================================
-- TRIGGERS
-- =============================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

drop trigger if exists trg_update_bill_total on transactions;
create trigger trg_update_bill_total
  after insert or update or delete on transactions
  for each row execute function trg_fn_update_bill_total();

-- =============================================
-- STORAGE
-- =============================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array[
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
])
on conflict (id) do update set
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies (skip if already exist — policies have no IF NOT EXISTS)
do $$ begin
  create policy "Users can upload their own avatar"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can update their own avatar"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Avatars are publicly readable"
    on storage.objects for select
    to public
    using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;

-- =============================================
-- CRON JOBS
-- =============================================

-- Remove previous schedules (idempotent)
do $$ begin
  perform cron.unschedule('telegram-daily-notify');
exception when others then null; end $$;
do $$ begin
  perform cron.unschedule('telegram-monthly-notify');
exception when others then null; end $$;

-- Daily summary — every day at 12:00 UTC (09:00 BRT)
select cron.schedule(
  'telegram-daily-notify',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := 'https://rknjcrcvsetspfvexjsu.supabase.co/functions/v1/telegram-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"type":"daily"}'::jsonb
  );
  $$
);

-- Monthly summary — 12:10 UTC on days 1, 16 and end-of-month candidates
select cron.schedule(
  'telegram-monthly-notify',
  '10 12 1,16,28,29,30,31 * *',
  $$
  select net.http_post(
    url     := 'https://rknjcrcvsetspfvexjsu.supabase.co/functions/v1/telegram-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"type":"monthly"}'::jsonb
  );
  $$
);

-- =============================================
-- PERFORMANCE INDEXES
-- =============================================
-- Cobrem os padrões de acesso mais frequentes:
--   WHERE owner_id = $1 AND date BETWEEN $2 AND $3
--   WHERE owner_id = $1 AND status = 'REALIZED'
--   WHERE owner_id = $1 AND date <= $2

-- entries: filtro por owner + date (list, totals, balance up-to)
create index if not exists idx_entries_owner_date
  on entries (owner_id, date);

-- entries: filtro por owner + status (v_available_balance, v_projected_balance)
create index if not exists idx_entries_owner_status
  on entries (owner_id, status);

-- entries: cobertura total para get_period_totals / get_balance_in_range
--   inclui amount para evitar heap fetch (index-only scan)
create index if not exists idx_entries_owner_date_amount
  on entries (owner_id, date) include (amount, status);

-- transactions: mesmo padrão
create index if not exists idx_transactions_owner_date
  on transactions (owner_id, date);

create index if not exists idx_transactions_owner_status
  on transactions (owner_id, status);

create index if not exists idx_transactions_owner_date_amount
  on transactions (owner_id, date) include (amount, status);

-- savings_movements: filtro por owner + date
create index if not exists idx_savings_movements_owner_date
  on savings_movements (owner_id, date);

-- accounts: filtro por owner (usado em quase toda query de saldo)
create index if not exists idx_accounts_owner
  on accounts (owner_id) where not is_archived;
