-- This seed must be run per-user after signup.
-- Use a Supabase Edge Function or trigger to call this on first login.

-- Example function to seed default data for a new user:
create or replace function seed_user_defaults(p_owner_id uuid)
returns void language plpgsql as $$
begin

  -- Domain lists: transaction_status
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'transaction_status', 'Realizado', 'REALIZED', true, true, 1),
    (p_owner_id, 'transaction_status', 'Projetado', 'PROJECTED', true, false, 2);

  -- Domain lists: transaction_type
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'transaction_type', 'Débito', 'DEBIT', true, true, 1),
    (p_owner_id, 'transaction_type', 'Crédito', 'CREDIT', true, false, 2);

  -- Domain lists: entry_type
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'entry_type', 'Salário', 'SALARY', false, true, 1),
    (p_owner_id, 'entry_type', 'Reembolso', 'REIMBURSEMENT', false, false, 2),
    (p_owner_id, 'entry_type', 'Transferência', 'TRANSFER', false, false, 3),
    (p_owner_id, 'entry_type', 'Outro', 'OTHER', false, false, 4);

  -- Domain lists: account_type
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'account_type', 'Conta Corrente', 'CHECKING', true, true, 1),
    (p_owner_id, 'account_type', 'Poupança', 'SAVINGS', true, false, 2);

  -- Domain lists: savings_movement_type
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'savings_movement_type', 'Depósito', 'DEPOSIT', true, true, 1),
    (p_owner_id, 'savings_movement_type', 'Resgate', 'WITHDRAWAL', true, false, 2);

  -- Domain lists: bill_status
  insert into domain_lists (owner_id, code, name, value, is_system, is_default, sort_order) values
    (p_owner_id, 'bill_status', 'Aberta', 'OPEN', true, true, 1),
    (p_owner_id, 'bill_status', 'Fechada', 'CLOSED', true, false, 2),
    (p_owner_id, 'bill_status', 'Paga', 'PAID', true, false, 3);

  -- Default categories
  insert into categories (owner_id, name, color) values
    (p_owner_id, 'Alimentação/Mercado', '#ef4444'),
    (p_owner_id, 'Assinaturas', '#8b5cf6'),
    (p_owner_id, 'Celular', '#06b6d4'),
    (p_owner_id, 'Combustível', '#f59e0b'),
    (p_owner_id, 'Convênio Médico', '#10b981'),
    (p_owner_id, 'Cuidados Pessoais', '#ec4899'),
    (p_owner_id, 'Despesas Carro', '#f97316'),
    (p_owner_id, 'Despesas Casa', '#84cc16'),
    (p_owner_id, 'Despesas Empresa', '#6366f1'),
    (p_owner_id, 'Despesas Terreno', '#a78bfa'),
    (p_owner_id, 'Estudo', '#0ea5e9'),
    (p_owner_id, 'Empréstimo Bancário', '#dc2626'),
    (p_owner_id, 'Empréstimo Pessoal', '#b91c1c'),
    (p_owner_id, 'Enxoval', '#f472b6'),
    (p_owner_id, 'Farmácia', '#34d399'),
    (p_owner_id, 'Games', '#7c3aed'),
    (p_owner_id, 'Investimentos', '#059669'),
    (p_owner_id, 'Lazer', '#fb923c'),
    (p_owner_id, 'Médico', '#14b8a6'),
    (p_owner_id, 'Pets', '#fbbf24'),
    (p_owner_id, 'Poupança', '#22c55e'),
    (p_owner_id, 'Presente', '#e879f9'),
    (p_owner_id, 'Roupas', '#f9a8d4'),
    (p_owner_id, 'Tarifas/Juros', '#6b7280'),
    (p_owner_id, 'TI', '#3b82f6'),
    (p_owner_id, 'Transporte Público', '#64748b'),
    (p_owner_id, 'Uber/99', '#000000'),
    (p_owner_id, 'Viagem', '#0891b2');

end;
$$;

-- Trigger to create profile and seed defaults on first login
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  perform seed_user_defaults(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
