-- ─────────────────────────────────────────────────────────────────────────────
-- create_missing_installments.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── DIAGNÓSTICO — rode isso primeiro para ver o estado real ──────────────────
SELECT
  id,
  description,
  total_installments,
  installment_number,
  installment_group_id,
  -- testa o regex
  (REGEXP_MATCH(description, '(\d{1,3})/(\d{1,3})\s*$'))[1]  AS parsed_curr,
  (REGEXP_MATCH(description, '(\d{1,3})/(\d{1,3})\s*$'))[2]  AS parsed_total,
  date
FROM transactions
WHERE owner_id           = '69f852bc-af5a-4f11-b293-37bf2f809018'
  AND total_installments > 1
ORDER BY description
LIMIT 30;
