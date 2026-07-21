-- ─────────────────────────────────────────────────────────────────────────────
-- fix_fragmented_groups.sql
-- Unifica installment_group_id fragmentados: parcelas da mesma compra que
-- receberam UUIDs diferentes em vez de um UUID compartilhado.
--
-- Critério de agrupamento (igual ao componente Angular):
--   base_desc = descrição sem o sufixo " XX/YY"
--   + credit_card_id + total_installments
--
-- Estratégia: para cada grupo lógico com múltiplos UUIDs, elege o menor UUID
-- (MIN) como canônico e atualiza todos os outros para ele.
-- Apenas UPDATE — nenhum registro novo, saldo não muda.
-- ─────────────────────────────────────────────────────────────────────────────

-- DRY RUN: mostra quantos registros serão afetados antes de executar o UPDATE
WITH parsed AS (
  SELECT
    id,
    REGEXP_REPLACE(description, '\s+\d+/\d+\s*$', '') AS base_desc,
    credit_card_id,
    total_installments,
    installment_group_id
  FROM transactions
  WHERE owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments > 1
    AND installment_group_id IS NOT NULL
    AND description        ~ '\d+/\d+\s*$'
),
canonical AS (
  SELECT
    base_desc,
    credit_card_id,
    total_installments,
    MIN(installment_group_id::text)::uuid AS canonical_gid,
    COUNT(DISTINCT installment_group_id)  AS uuid_count
  FROM parsed
  GROUP BY base_desc, credit_card_id, total_installments
  HAVING COUNT(DISTINCT installment_group_id) > 1
)
SELECT
  p.base_desc,
  p.total_installments,
  c.uuid_count   AS grupos_fragmentados,
  c.canonical_gid AS uuid_eleito,
  p.installment_group_id AS uuid_atual,
  p.id
FROM parsed p
JOIN canonical c
  ON  c.base_desc          = p.base_desc
  AND c.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
  AND c.total_installments = p.total_installments
WHERE p.installment_group_id <> c.canonical_gid
ORDER BY p.base_desc, p.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Após confirmar o DRY RUN acima, execute o UPDATE abaixo:
-- ─────────────────────────────────────────────────────────────────────────────
/*
WITH parsed AS (
  SELECT
    id,
    REGEXP_REPLACE(description, '\s+\d+/\d+\s*$', '') AS base_desc,
    credit_card_id,
    total_installments,
    installment_group_id
  FROM transactions
  WHERE owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments > 1
    AND installment_group_id IS NOT NULL
    AND description        ~ '\d+/\d+\s*$'
),
canonical AS (
  SELECT
    base_desc,
    credit_card_id,
    total_installments,
    MIN(installment_group_id::text)::uuid AS canonical_gid
  FROM parsed
  GROUP BY base_desc, credit_card_id, total_installments
  HAVING COUNT(DISTINCT installment_group_id) > 1
)
UPDATE transactions t
SET
  installment_group_id = c.canonical_gid,
  updated_at           = NOW()
FROM parsed p
JOIN canonical c
  ON  c.base_desc          = p.base_desc
  AND c.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
  AND c.total_installments = p.total_installments
WHERE t.id = p.id
  AND p.installment_group_id <> c.canonical_gid;
*/
