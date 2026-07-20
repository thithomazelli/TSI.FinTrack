-- ─────────────────────────────────────────────────────────────────────────────
-- fix_installment_groups.sql  (v3 — corrige o update anterior)
--
-- CONTEXTO:
--   Uma série de parcelas pode ter alguns registros com installment_group_id
--   correto (inseridos pelo sistema) e outros NULL (importados avulso).
--   O update anterior atribuiu UUIDs únicos para cada linha NULL, quebrando
--   o agrupamento.
--
-- ETAPA 1 — Reverter: reassociar registros "solo" ao grupo dos irmãos.
--   Um registro "solo" é aquele cujo group_id pertence a exatamente 1
--   transação. Se existe outro grupo com a mesma base_desc + credit_card_id +
--   total_installments, o registro é reassociado a esse grupo.
--
-- ETAPA 2 — Para solos sem irmãos (séries onde TODAS as parcelas foram
--   importadas avulsas): agrupar pelo mesmo critério (base_desc + card + total)
--   e atribuir um único UUID por conjunto.
--
-- EXECUÇÃO:
--   1. DRY RUN (SELECTs) para conferir.
--   2. BEGIN; ETAPA 1; ETAPA 2; COMMIT; (ou ROLLBACK se algo parecer errado)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: função de extração da descrição-base (idêntica ao componente) ────
-- A regex do componente Angular é: /^(.*?)\s+(\d{1,2})\/(\d{1,2})$/
-- Em SQL: strip do sufixo " XX/YY" no final

-- ── DRY RUN — Etapa 1: solos que têm irmãos a adotar ────────────────────────
WITH parsed AS (
  SELECT
    id,
    installment_group_id,
    credit_card_id,
    total_installments,
    REGEXP_REPLACE(description, '\s+\d{1,3}/\d{1,3}$', '') AS base_desc
  FROM transactions
  WHERE owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments > 1
    AND installment_group_id IS NOT NULL
),
solo_ids AS (
  SELECT installment_group_id
  FROM parsed
  GROUP BY installment_group_id
  HAVING COUNT(*) = 1
),
sibling_groups AS (
  SELECT
    base_desc,
    credit_card_id,
    total_installments,
    installment_group_id,
    COUNT(*) AS members
  FROM parsed
  WHERE installment_group_id NOT IN (SELECT installment_group_id FROM solo_ids)
  GROUP BY base_desc, credit_card_id, total_installments, installment_group_id
)
SELECT
  p.id,
  p.installment_group_id   AS old_group_id,
  p.base_desc,
  p.credit_card_id,
  p.total_installments,
  sg.installment_group_id  AS new_group_id,
  sg.members               AS siblings_count
FROM parsed p
JOIN solo_ids s ON s.installment_group_id = p.installment_group_id
LEFT JOIN sibling_groups sg
       ON  sg.base_desc          = p.base_desc
       AND sg.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
       AND sg.total_installments = p.total_installments
ORDER BY p.base_desc;

-- ── DRY RUN — Etapa 2: solos sem irmãos (série toda importada avulsa) ────────
WITH parsed AS (
  SELECT
    id,
    installment_group_id,
    credit_card_id,
    total_installments,
    REGEXP_REPLACE(description, '\s+\d{1,3}/\d{1,3}$', '') AS base_desc
  FROM transactions
  WHERE owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments > 1
    AND installment_group_id IS NOT NULL
),
solo_ids AS (
  SELECT installment_group_id
  FROM parsed
  GROUP BY installment_group_id
  HAVING COUNT(*) = 1
),
sibling_groups AS (
  SELECT base_desc, credit_card_id, total_installments
  FROM parsed
  WHERE installment_group_id NOT IN (SELECT installment_group_id FROM solo_ids)
  GROUP BY base_desc, credit_card_id, total_installments
)
SELECT
  p.base_desc,
  p.credit_card_id,
  p.total_installments,
  COUNT(*) AS solo_records_to_merge,
  ARRAY_AGG(p.id) AS ids
FROM parsed p
JOIN solo_ids s ON s.installment_group_id = p.installment_group_id
WHERE NOT EXISTS (
  SELECT 1 FROM sibling_groups sg
  WHERE  sg.base_desc          = p.base_desc
    AND  sg.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
    AND  sg.total_installments = p.total_installments
)
GROUP BY p.base_desc, p.credit_card_id, p.total_installments
ORDER BY p.base_desc;


-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE (execute após confirmar os DRY RUNs acima)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── Etapa 1: reassociar solos aos irmãos ─────────────────────────────────────
WITH parsed AS (
  SELECT
    id,
    installment_group_id,
    credit_card_id,
    total_installments,
    REGEXP_REPLACE(description, '\s+\d{1,3}/\d{1,3}$', '') AS base_desc
  FROM transactions
  WHERE owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments > 1
    AND installment_group_id IS NOT NULL
),
solo_ids AS (
  SELECT installment_group_id
  FROM parsed
  GROUP BY installment_group_id
  HAVING COUNT(*) = 1
),
-- O grupo "dominante" de irmãos (o com mais membros, para desempate)
sibling_winner AS (
  SELECT DISTINCT ON (base_desc, credit_card_id, total_installments)
    base_desc,
    credit_card_id,
    total_installments,
    installment_group_id AS winner_group_id
  FROM parsed
  WHERE installment_group_id NOT IN (SELECT installment_group_id FROM solo_ids)
  GROUP BY base_desc, credit_card_id, total_installments, installment_group_id
  ORDER BY base_desc, credit_card_id, total_installments, COUNT(*) DESC
),
to_fix AS (
  SELECT p.id, sw.winner_group_id
  FROM parsed p
  JOIN solo_ids s  ON s.installment_group_id = p.installment_group_id
  JOIN sibling_winner sw
    ON  sw.base_desc          = p.base_desc
    AND sw.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
    AND sw.total_installments = p.total_installments
)
UPDATE transactions t
SET installment_group_id = f.winner_group_id,
    updated_at           = NOW()
FROM to_fix f
WHERE t.id = f.id;

-- ── Etapa 2: séries onde TODAS as parcelas são solos → novo UUID por série ───
WITH parsed AS (
  SELECT
    id,
    installment_group_id,
    credit_card_id,
    total_installments,
    REGEXP_REPLACE(description, '\s+\d{1,3}/\d{1,3}$', '') AS base_desc
  FROM transactions
  WHERE owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments > 1
    AND installment_group_id IS NOT NULL
),
solo_ids AS (
  SELECT installment_group_id
  FROM parsed
  GROUP BY installment_group_id
  HAVING COUNT(*) = 1
),
sibling_exists AS (
  SELECT base_desc, credit_card_id, total_installments
  FROM parsed
  WHERE installment_group_id NOT IN (SELECT installment_group_id FROM solo_ids)
  GROUP BY base_desc, credit_card_id, total_installments
),
-- Gera UM UUID por série-solo (sem irmãos)
series_uuid AS (
  SELECT
    p.base_desc, p.credit_card_id, p.total_installments,
    gen_random_uuid() AS new_gid
  FROM parsed p
  JOIN solo_ids s ON s.installment_group_id = p.installment_group_id
  WHERE NOT EXISTS (
    SELECT 1 FROM sibling_exists se
    WHERE  se.base_desc          = p.base_desc
      AND  se.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
      AND  se.total_installments = p.total_installments
  )
  GROUP BY p.base_desc, p.credit_card_id, p.total_installments
)
UPDATE transactions t
SET installment_group_id = su.new_gid,
    updated_at           = NOW()
FROM parsed p
JOIN solo_ids s  ON s.installment_group_id = p.installment_group_id
JOIN series_uuid su
  ON  su.base_desc          = p.base_desc
  AND su.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
  AND su.total_installments = p.total_installments
WHERE t.id = p.id
  AND NOT EXISTS (
    SELECT 1 FROM (
      SELECT base_desc, credit_card_id, total_installments
      FROM parsed WHERE installment_group_id NOT IN (SELECT installment_group_id FROM solo_ids)
      GROUP BY base_desc, credit_card_id, total_installments
    ) se
    WHERE  se.base_desc          = p.base_desc
      AND  se.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
      AND  se.total_installments = p.total_installments
  );

-- Confira o count de cada etapa, depois:
-- COMMIT;   ← confirma
-- ROLLBACK; ← cancela
