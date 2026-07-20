-- ─────────────────────────────────────────────────────────────────────────────
-- fix_installment_groups.sql
-- Corrige parcelas sem installment_group_id compartilhado.
--
-- Lógica de agrupamento:
--   • Descrição-base = descrição sem o sufixo " - XX/YY" (ex: "Netflix - 03/12" → "Netflix")
--   • Agrupa por: (owner_id, credit_card_id, descrição-base, total_installments, amount)
--   • Dentro do grupo, ordena por date ASC e reatribui installment_number = 1, 2, 3...
--   • Atribui um UUID único por grupo em installment_group_id
--
-- EXECUÇÃO:
--   1. Rode o DRY RUN para conferir os grupos que serão corrigidos.
--   2. Quando satisfeito, execute o bloco UPDATE dentro de BEGIN/COMMIT.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── DRY RUN — confira antes ───────────────────────────────────────────────────
WITH parsed AS (
  SELECT
    id,
    date,
    description,
    amount,
    credit_card_id,
    total_installments,
    installment_number,
    installment_group_id,
    REGEXP_REPLACE(description, '\s*[-–]?\s*\d{1,3}/\d{1,3}\s*$', '') AS base_desc
  FROM transactions
  WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments   > 1
    AND installment_group_id IS NULL
),
grouped AS (
  SELECT
    base_desc,
    credit_card_id,
    amount,
    total_installments,
    COUNT(*)                                      AS found,
    ARRAY_AGG(id          ORDER BY date)          AS ids,
    ARRAY_AGG(date        ORDER BY date)          AS dates,
    ARRAY_AGG(description ORDER BY date)          AS descriptions
  FROM parsed
  GROUP BY base_desc, credit_card_id, amount, total_installments
)
SELECT
  base_desc,
  credit_card_id,
  amount,
  total_installments,
  found                          AS parcelas_encontradas,
  total_installments - found     AS parcelas_faltando,
  descriptions                   AS descricoes,
  dates                          AS datas,
  ids                            AS transaction_ids
FROM grouped
ORDER BY base_desc, credit_card_id, (dates)[1];


-- ── UPDATE (rode após confirmar o DRY RUN) ────────────────────────────────────
BEGIN;

WITH parsed AS (
  SELECT
    id,
    date,
    credit_card_id,
    amount,
    total_installments,
    REGEXP_REPLACE(description, '\s*[-–]?\s*\d{1,3}/\d{1,3}\s*$', '') AS base_desc
  FROM transactions
  WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments   > 1
    AND installment_group_id IS NULL
),
-- One stable UUID per logical group
group_uuids AS (
  SELECT
    base_desc,
    credit_card_id,
    amount,
    total_installments,
    gen_random_uuid() AS new_group_id
  FROM parsed
  GROUP BY base_desc, credit_card_id, amount, total_installments
),
-- Row number per group (determines the corrected installment_number)
ranked AS (
  SELECT
    p.id,
    gu.new_group_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.base_desc, p.credit_card_id, p.amount, p.total_installments
      ORDER BY p.date
    ) AS new_installment_number
  FROM parsed p
  JOIN group_uuids gu
    ON  gu.base_desc          = p.base_desc
    AND gu.credit_card_id     = p.credit_card_id
    AND gu.amount             = p.amount
    AND gu.total_installments = p.total_installments
)
UPDATE transactions t
SET
  installment_group_id = r.new_group_id,
  installment_number   = r.new_installment_number,
  updated_at           = NOW()
FROM ranked r
WHERE t.id = r.id;

-- Verifique o número de linhas afetadas, depois:
-- COMMIT;   ← confirma
-- ROLLBACK; ← cancela se algo não parecer certo
