-- ─────────────────────────────────────────────────────────────────────────────
-- link_installment_groups.sql
-- Atribui installment_group_id compartilhado a registros da mesma série.
-- Apenas UPDATE — nenhum registro novo é criado, saldo não muda.
--
-- Critério de agrupamento (igual ao componente Angular):
--   base_desc = descrição sem o sufixo " XX/YY"
--   + credit_card_id + total_installments
--
-- Resultado:
--   • Parcelas da mesma compra → mesmo installment_group_id
--   • Registros sem irmãos → UUID próprio (ficam como grupo solo)
-- ─────────────────────────────────────────────────────────────────────────────
WITH parsed AS (
  SELECT
    id,
    REGEXP_REPLACE(description, '\s+\d+/\d+\s*$', '') AS base_desc,
    credit_card_id,
    total_installments
  FROM transactions
  WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments   > 1
    AND installment_group_id IS NULL
    AND description          ~ '\d+/\d+\s*$'
),
group_uuids AS (
  -- Um UUID por combinação (base_desc, cartão, total)
  SELECT DISTINCT ON (base_desc, credit_card_id, total_installments)
    base_desc,
    credit_card_id,
    total_installments,
    gen_random_uuid() AS gid
  FROM parsed
)
UPDATE transactions t
SET
  installment_group_id = gu.gid,
  installment_number   = CAST((REGEXP_MATCH(t.description, '(\d+)/\d+\s*$'))[1] AS int),
  updated_at           = NOW()
FROM parsed p
JOIN group_uuids gu
  ON  gu.base_desc          = p.base_desc
  AND gu.credit_card_id     IS NOT DISTINCT FROM p.credit_card_id
  AND gu.total_installments = p.total_installments
WHERE t.id = p.id;
