-- ─────────────────────────────────────────────────────────────────────────────
-- create_missing_installments.sql
-- Cria as parcelas futuras faltantes para registros importados avulsos.
--
-- LÓGICA:
--   • Identifica grupos com apenas 1 registro (série incompleta).
--   • Extrai número atual e total da descrição ("04/07" → num=4, total=7).
--   • Cria as parcelas de (num+1) até total, com datas extrapoladas (+N meses).
--   • Apenas parcelas futuras (date >= hoje) são criadas → não afeta saldos passados.
--   • Status = PROJECTED.
--   • Compartilham o mesmo installment_group_id do registro existente.
--
-- EXECUÇÃO:
--   1. DRY RUN para conferir o que será criado.
--   2. BEGIN; INSERT; COMMIT; (ou ROLLBACK).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── DRY RUN ───────────────────────────────────────────────────────────────────
WITH solo AS (
  SELECT
    id,
    owner_id,
    description,
    amount,
    date::date                                                          AS payment_date,
    purchase_date::date                                                 AS purchase_dt,
    status,
    category_id,
    account_id,
    credit_card_id,
    labels,
    installment_group_id,
    total_installments,
    -- Extract current installment number from description suffix
    CAST((REGEXP_MATCH(description, '\s(\d{1,3})/\d{1,3}$'))[1] AS int) AS curr_num,
    CAST((REGEXP_MATCH(description, '\s\d{1,3}/(\d{1,3})$'))[1] AS int) AS total_from_desc,
    -- Base description without " XX/YY" suffix
    REGEXP_REPLACE(description, '\s\d{1,3}/\d{1,3}$', '')               AS base_desc
  FROM transactions
  WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments   > 1
    AND installment_group_id IS NOT NULL
    AND (REGEXP_MATCH(description, '\s(\d{1,3})/\d{1,3}$'))[1] IS NOT NULL
    AND installment_group_id IN (
      SELECT installment_group_id
      FROM transactions
      WHERE owner_id = '69f852bc-af5a-4f11-b293-37bf2f809018'
        AND total_installments > 1
      GROUP BY installment_group_id
      HAVING COUNT(*) = 1
    )
),
missing AS (
  SELECT
    s.*,
    n                                                                   AS new_num,
    LPAD(n::text, 2, '0') || '/' || LPAD(s.total_from_desc::text, 2, '0') AS suffix,
    (s.payment_date + ((n - s.curr_num) * INTERVAL '1 month'))::date   AS new_date
  FROM solo s
  CROSS JOIN generate_series(1, COALESCE(s.total_from_desc, s.total_installments)) n
  WHERE n <> s.curr_num  -- skip the existing record
)
SELECT
  base_desc,
  credit_card_id,
  total_from_desc   AS total,
  curr_num          AS existing_num,
  new_num,
  new_date,
  amount,
  installment_group_id,
  CASE WHEN new_date >= CURRENT_DATE THEN 'PROJECTED' ELSE 'skipped (past)' END AS will_create
FROM missing
ORDER BY base_desc, new_num;


-- ── INSERT (execute após confirmar o DRY RUN) ─────────────────────────────────
BEGIN;

WITH solo AS (
  SELECT
    id,
    owner_id,
    description,
    amount,
    date::date                                                           AS payment_date,
    purchase_date::date                                                  AS purchase_dt,
    category_id,
    account_id,
    credit_card_id,
    labels,
    installment_group_id,
    total_installments,
    CAST((REGEXP_MATCH(description, '\s(\d{1,3})/\d{1,3}$'))[1] AS int) AS curr_num,
    CAST((REGEXP_MATCH(description, '\s\d{1,3}/(\d{1,3})$'))[1] AS int) AS total_from_desc,
    REGEXP_REPLACE(description, '\s\d{1,3}/\d{1,3}$', '')               AS base_desc
  FROM transactions
  WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments   > 1
    AND installment_group_id IS NOT NULL
    AND (REGEXP_MATCH(description, '\s(\d{1,3})/\d{1,3}$'))[1] IS NOT NULL
    AND installment_group_id IN (
      SELECT installment_group_id
      FROM transactions
      WHERE owner_id = '69f852bc-af5a-4f11-b293-37bf2f809018'
        AND total_installments > 1
      GROUP BY installment_group_id
      HAVING COUNT(*) = 1
    )
),
missing AS (
  SELECT
    s.owner_id,
    s.base_desc || ' - ' ||
      LPAD(n::text, 2, '0') || '/' ||
      LPAD(s.total_from_desc::text, 2, '0')                             AS description,
    s.amount,
    (s.payment_date + ((n - s.curr_num) * INTERVAL '1 month'))::date   AS new_date,
    s.purchase_dt,
    s.category_id,
    s.account_id,
    s.credit_card_id,
    s.labels,
    s.installment_group_id,
    COALESCE(s.total_from_desc, s.total_installments)                   AS total_installments,
    n                                                                    AS installment_number
  FROM solo s
  CROSS JOIN generate_series(1, COALESCE(s.total_from_desc, s.total_installments)) n
  WHERE n <> s.curr_num
    AND (s.payment_date + ((n - s.curr_num) * INTERVAL '1 month'))::date >= CURRENT_DATE
)
INSERT INTO transactions (
  id,
  owner_id,
  description,
  amount,
  date,
  purchase_date,
  status,
  category_id,
  account_id,
  credit_card_id,
  credit_card_bill_id,
  labels,
  installment_group_id,
  total_installments,
  installment_number,
  position,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  owner_id,
  description,
  amount,
  new_date,
  purchase_dt,
  'PROJECTED',
  category_id,
  account_id,
  credit_card_id,
  NULL,
  labels,
  installment_group_id,
  total_installments,
  installment_number,
  NULL,
  NOW(),
  NOW()
FROM missing;

-- Confira o número de linhas inseridas, depois:
-- COMMIT;   ← confirma
-- ROLLBACK; ← cancela
