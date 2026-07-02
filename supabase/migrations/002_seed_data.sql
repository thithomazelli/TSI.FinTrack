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

  -- Default categories (with definitive colors)
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
