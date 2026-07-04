-- Seed recurring templates for Thiago
-- Lookup IDs by name so it works regardless of which UUIDs were generated.
-- Safe to run multiple times: skips templates that already exist (by description).
do $$ declare
  uid        uuid := '69f852bc-af5a-4f11-b293-37bf2f809018';

  -- Categories
  cat_salario     uuid; cat_alimentacao uuid; cat_carro   uuid;
  cat_casa        uuid; cat_terreno     uuid; cat_estudo  uuid;
  cat_convenio    uuid; cat_pets        uuid; cat_assinas uuid;
  cat_seguros     uuid; cat_transporte  uuid; cat_outros  uuid;

  -- Accounts
  acc_itau  uuid;

  -- Credit cards
  card_latam uuid;

begin
  -- Resolve category IDs by name
  select id into cat_salario    from categories where owner_id = uid and name = 'Salário'          limit 1;
  select id into cat_alimentacao from categories where owner_id = uid and name = 'Alimentação'     limit 1;
  select id into cat_carro      from categories where owner_id = uid and name = 'Despesas carro'   limit 1;
  select id into cat_casa       from categories where owner_id = uid and name = 'Despesas casa'    limit 1;
  select id into cat_terreno    from categories where owner_id = uid and name = 'Despesas terreno' limit 1;
  select id into cat_estudo     from categories where owner_id = uid and name = 'Estudo'           limit 1;
  select id into cat_convenio   from categories where owner_id = uid and name = 'Convênio Médico'  limit 1;
  select id into cat_pets       from categories where owner_id = uid and name = 'Pets'             limit 1;
  select id into cat_assinas    from categories where owner_id = uid and name = 'Assinaturas'      limit 1;
  select id into cat_seguros    from categories where owner_id = uid and name = 'Seguros'          limit 1;
  select id into cat_transporte from categories where owner_id = uid and name = 'Transporte'       limit 1;
  select id into cat_outros     from categories where owner_id = uid and name = 'Outros'           limit 1;

  -- Resolve account IDs
  select id into acc_itau  from accounts where owner_id = uid and name = 'Itaú'  limit 1;

  -- Resolve credit card IDs
  select id into card_latam from credit_cards where owner_id = uid and name ilike '%Latam%' limit 1;

  -- Insert templates (skip if description already exists for this owner)
  insert into recurring_templates
    (owner_id, description, amount, type, day_of_month, frequency, months, is_active, category_id, account_id, credit_card_id, position)
  select uid, t.description, t.amount, t.type, t.day_of_month, t.frequency, t.months, t.is_active, t.category_id, t.account_id, t.credit_card_id, t.position
  from (values
    -- ── Entradas mensais ────────────────────────────────────────────────────
    ('RDI - Salário',                   17332.55, 'ENTRY',       5,  'monthly',  '{}'::int[],  true, cat_salario,     acc_itau,  null,       10),
    ('Nicole - Pagto Contas',           2000.00,  'ENTRY',       5,  'monthly',  '{}',         true, cat_outros,      acc_itau,  null,       20),
    ('Pagto Mãe - Convênio',            315.00,   'ENTRY',       5,  'monthly',  '{}',         true, cat_convenio,    acc_itau,  null,       30),
    -- ── Entradas esporádicas ─────────────────────────────────────────────────
    ('RDI - Férias',                    10100.97, 'ENTRY',       5,  'sporadic', '{3}',        true, cat_salario,     acc_itau,  null,       40),
    ('RDI - 1/3 Férias',               3366.99,  'ENTRY',       5,  'sporadic', '{3}',        true, cat_salario,     acc_itau,  null,       50),
    ('RDI - Abono pecuniário',          6733.98,  'ENTRY',       5,  'sporadic', '{3}',        true, cat_salario,     acc_itau,  null,       60),
    ('RDI - 1/3 Abono pecuniário',      2244.65,  'ENTRY',       5,  'sporadic', '{3}',        true, cat_salario,     acc_itau,  null,       70),
    ('RDI - INSS (desconto férias)',    -988.07,  'ENTRY',       5,  'sporadic', '{3}',        true, cat_outros,      acc_itau,  null,       80),
    ('RDI - IRRF (desconto férias)',    -3088.38, 'ENTRY',       5,  'sporadic', '{3}',        true, cat_outros,      acc_itau,  null,       90),
    ('RDI - 13º Salário - 01/02',       10100.98, 'ENTRY',       20, 'sporadic', '{6}',        true, cat_salario,     acc_itau,  null,       100),
    ('FGTS - Saque Aniversário',        1130.68,  'ENTRY',       15, 'sporadic', '{7}',        true, cat_salario,     acc_itau,  null,       110),
    ('RDI - 13º Salário - 02/02',       4408.71,  'ENTRY',       20, 'sporadic', '{12}',       true, cat_salario,     acc_itau,  null,       120),
    -- ── Saídas Débito mensais ────────────────────────────────────────────────
    ('Sem Parar',                        20.67,   'TRANSACTION',  5, 'monthly',  '{}',         true, cat_carro,       acc_itau,  null,       130),
    ('Conta Água',                       200.00,  'TRANSACTION', 10, 'monthly',  '{}',         true, cat_casa,        acc_itau,  null,       140),
    ('Conta Luz',                        500.00,  'TRANSACTION', 10, 'monthly',  '{}',         true, cat_casa,        acc_itau,  null,       150),
    ('Conta Net',                        200.00,  'TRANSACTION', 10, 'monthly',  '{}',         true, cat_casa,        acc_itau,  null,       160),
    ('English Class - Tatiana Elman',   1300.00,  'TRANSACTION',  5, 'monthly',  '{}',         true, cat_estudo,      acc_itau,  null,       170),
    ('Financiamento Onix 2022',         2242.32,  'TRANSACTION', 15, 'monthly',  '{}',         true, cat_carro,       acc_itau,  null,       180),
    ('Convênio Mãe',                     941.66,  'TRANSACTION',  5, 'monthly',  '{}',         true, cat_convenio,    acc_itau,  null,       190),
    ('Casa Santo André - Aluguel',      2500.00,  'TRANSACTION', 10, 'monthly',  '{}',         true, cat_casa,        acc_itau,  null,       200),
    ('Obra Maragogi - INSS',             267.69,  'TRANSACTION', 20, 'monthly',  '{}',         true, cat_terreno,     acc_itau,  null,       210),
    -- ── Saídas Fatura Latam Pass mensais ────────────────────────────────────
    ('Anuidade Cartão Latam Pass',       100.00,  'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      220),
    ('Premiere - Assinatura',             29.90,  'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      230),
    ('Ifood / Mercado / Comidas',          0.00,  'TRANSACTION', 17, 'monthly',  '{}',         true, cat_alimentacao, null, card_latam,      240),
    ('Ifood Club',                          7.95, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      250),
    ('Apple iCloud+',                      66.90, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      260),
    ('ClaroFlex',                          49.99, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      270),
    ('Amazon Prime',                       19.90, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      280),
    ('Youtube Premium',                    69.90, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      290),
    ('Spotify',                            40.90, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      300),
    ('Google Drive - Thiago',               9.99, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      310),
    ('Google Drive - Nicole',               9.99, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      320),
    ('Netflix',                            59.90, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      330),
    ('Mercado Livre Plus',                 14.99, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_assinas,     null, card_latam,      340),
    ('Auto Posto - Etanol',               500.00, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_transporte,  null, card_latam,      350),
    ('Cobasi - Areia p/ Gatos',           105.89, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_pets,        null, card_latam,      360),
    ('Cobasi - Ração p/ Gatos',           180.70, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_pets,        null, card_latam,      370),
    ('Tokio Marine - Seguro Carro',       214.88, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_seguros,     null, card_latam,      380),
    ('Tokio Marine - Seguro Residencial',  57.18, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_seguros,     null, card_latam,      390),
    ('Petlove - Plano p/ Gatos',           36.06, 'TRANSACTION', 17, 'monthly',  '{}',         true, cat_pets,        null, card_latam,      400)
  ) as t(description, amount, type, day_of_month, frequency, months, is_active, category_id, account_id, credit_card_id, position)
  where not exists (
    select 1 from recurring_templates rt
    where rt.owner_id = uid and rt.description = t.description
  );

  raise notice 'recurring_templates seed concluído.';
end $$;
