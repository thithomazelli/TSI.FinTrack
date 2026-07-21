-- ─────────────────────────────────────────────────────────────────────────────
-- create_missing_installments.sql
-- Cria as parcelas futuras faltantes para registros importados avulsos.
--
-- Cobre dois cenários:
--   A) installment_group_id IS NULL  → registro nunca teve group_id
--   B) installment_group_id solo     → group_id único para 1 registro
--
-- LÓGICA:
--   • Identifica registros com total_installments > 1 e apenas 1 linha no grupo.
--   • Extrai número atual e total do sufixo da descrição ("04/07" → num=4, total=7).
--   • Cria parcelas futuras (date >= hoje) como PROJECTED.
--   • Todas as novas parcelas compartilham o mesmo installment_group_id
--     (gerado agora se NULL, ou reusa o existente).
--   • O registro original também tem seu group_id atualizado se NULL.
--
-- EXECUÇÃO:
--   1. DRY RUN (SELECT) para conferir.
--   2. BEGIN; bloco UPDATE + INSERT; COMMIT; (ou ROLLBACK).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── DRY RUN ───────────────────────────────────────────────────────────────────
WITH candidates AS (
  SELECT
    t.id,
    t.owner_id,
    t.description,
    t.amount,
    t.date::date                                                           AS payment_date,
    t.purchase_date::date                                                  AS purchase_dt,
    t.category_id,
    t.account_id,
    t.credit_card_id,
    t.labels,
    t.installment_group_id,
    t.total_installments,
    CAST((REGEXP_MATCH(t.description, '\s(\d{1,3})/\d{1,3}$'))[1] AS int) AS curr_num,
    CAST((REGEXP_MATCH(t.description, '\s\d{1,3}/(\d{1,3})$'))[1] AS int) AS total_from_desc,
    REGEXP_REPLACE(t.description, '\s\d{1,3}/\d{1,3}$', '')               AS base_desc
  FROM transactions t
  WHERE t.owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND t.total_installments > 1
    AND (REGEXP_MATCH(t.description, '\s(\d{1,3})/\d{1,3}$'))[1] IS NOT NULL
    AND (
      -- Caso A: sem group_id
      t.installment_group_id IS NULL
      OR
      -- Caso B: group_id solo (só esse registro usa esse id)
      t.installment_group_id IN (
        SELECT installment_group_id
        FROM transactions
        WHERE owner_id         = '69f852bc-af5a-4f11-b293-37bf2f809018'
          AND installment_group_id IS NOT NULL
        GROUP BY installment_group_id
        HAVING COUNT(*) = 1
      )
    )
),
missing AS (
  SELECT
    c.id                                                                   AS source_id,
    c.base_desc || ' - ' ||
      LPAD(n::text, 2, '0') || '/' ||
      LPAD(c.total_from_desc::text, 2, '0')                               AS description,
    c.payment_date,
    c.curr_num,
    c.total_from_desc,
    c.installment_group_id,
    c.credit_card_id,
    c.amount,
    n                                                                       AS new_num,
    (c.payment_date + ((n - c.curr_num) * INTERVAL '1 month'))::date       AS new_date
  FROM candidates c
  CROSS JOIN generate_series(1, c.total_from_desc) n
  WHERE n <> c.curr_num
)
SELECT
  source_id,
  description,
  new_num,
  new_date,
  amount,
  credit_card_id,
  CASE
    WHEN new_date >= CURRENT_DATE THEN 'será criada (PROJECTED)'
    ELSE 'ignorada (passado)'
  END AS acao
FROM missing
ORDER BY description, new_num;


-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE + INSERT (execute após confirmar o DRY RUN)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Passo 1: atribuir group_id aos registros que ainda têm NULL
--          (os solos já têm um, esse step só afeta o caso A)
UPDATE transactions
SET    installment_group_id = gen_random_uuid(),
       updated_at           = NOW()
WHERE  owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
  AND  total_installments   > 1
  AND  installment_group_id IS NULL
  AND  (REGEXP_MATCH(description, '\s(\d{1,3})/\d{1,3}$'))[1] IS NOT NULL;

-- Passo 2: criar as parcelas futuras faltantes
WITH candidates AS (
  SELECT
    t.id,
    t.owner_id,
    t.description,
    t.amount,
    t.date::date                                                           AS payment_date,
    t.purchase_date::date                                                  AS purchase_dt,
    t.category_id,
    t.account_id,
    t.credit_card_id,
    t.labels,
    t.installment_group_id,
    t.total_installments,
    CAST((REGEXP_MATCH(t.description, '\s(\d{1,3})/\d{1,3}$'))[1] AS int) AS curr_num,
    CAST((REGEXP_MATCH(t.description, '\s\d{1,3}/(\d{1,3})$'))[1] AS int) AS total_from_desc,
    REGEXP_REPLACE(t.description, '\s\d{1,3}/\d{1,3}$', '')               AS base_desc
  FROM transactions t
  WHERE t.owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND t.total_installments > 1
    AND (REGEXP_MATCH(t.description, '\s(\d{1,3})/\d{1,3}$'))[1] IS NOT NULL
    AND t.installment_group_id IN (
      SELECT installment_group_id
      FROM transactions
      WHERE owner_id         = '69f852bc-af5a-4f11-b293-37bf2f809018'
        AND installment_group_id IS NOT NULL
      GROUP BY installment_group_id
      HAVING COUNT(*) = 1
    )
),
missing AS (
  SELECT
    c.owner_id,
    c.base_desc || ' - ' ||
      LPAD(n::text, 2, '0') || '/' ||
      LPAD(c.total_from_desc::text, 2, '0')                               AS description,
    c.amount,
    (c.payment_date + ((n - c.curr_num) * INTERVAL '1 month'))::date       AS new_date,
    c.purchase_dt,
    c.category_id,
    c.account_id,
    c.credit_card_id,
    c.labels,
    c.installment_group_id,
    c.total_from_desc                                                       AS total_installments,
    n                                                                       AS installment_number
  FROM candidates c
  CROSS JOIN generate_series(1, c.total_from_desc) n
  WHERE n <> c.curr_num
    AND (c.payment_date + ((n - c.curr_num) * INTERVAL '1 month'))::date >= CURRENT_DATE
)
INSERT INTO transactions (
  id, owner_id, description, amount, date, purchase_date,
  status, category_id, account_id, credit_card_id, credit_card_bill_id,
  labels, installment_group_id, total_installments, installment_number,
  position, created_at, updated_at
)
SELECT
  gen_random_uuid(), owner_id, description, amount, new_date, purchase_dt,
  'PROJECTED', category_id, account_id, credit_card_id, NULL,
  labels, installment_group_id, total_installments, installment_number,
  NULL, NOW(), NOW()
FROM missing;

-- Confira o número de linhas afetadas em cada passo, depois:
-- COMMIT;   ← confirma
-- ROLLBACK; ← cancela
