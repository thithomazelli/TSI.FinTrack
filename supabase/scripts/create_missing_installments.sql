-- ═════════════════════════════════════════════════════════════════════════════
-- PASSO 1 — Execute este bloco primeiro.
-- Atribui um installment_group_id único a cada parcela órfã (group_id NULL).
-- ═════════════════════════════════════════════════════════════════════════════
UPDATE transactions t
SET
  installment_group_id = sub.new_gid,
  installment_number   = CAST((REGEXP_MATCH(t.description, '(\d+)/(\d+)\s*$'))[1] AS int),
  updated_at           = NOW()
FROM (
  SELECT id, gen_random_uuid() AS new_gid
  FROM transactions
  WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments   > 1
    AND installment_group_id IS NULL
    AND description          ~ '\d+/\d+\s*$'
) sub
WHERE t.id = sub.id;


-- ═════════════════════════════════════════════════════════════════════════════
-- PASSO 2 — Execute este bloco depois do Passo 1.
-- Cria as parcelas futuras faltantes para cada série com apenas 1 registro.
-- ═════════════════════════════════════════════════════════════════════════════
INSERT INTO transactions (
  id, owner_id, description, amount, date, purchase_date,
  status, category_id, account_id, credit_card_id, credit_card_bill_id,
  labels, installment_group_id, total_installments, installment_number,
  position, created_at, updated_at
)
WITH solo AS (
  SELECT
    owner_id,
    description,
    amount,
    date::date                                                             AS pay_date,
    purchase_date::date                                                    AS purch_date,
    category_id,
    account_id,
    credit_card_id,
    labels,
    installment_group_id,
    total_installments,
    CAST((REGEXP_MATCH(description, '(\d+)/(\d+)\s*$'))[1] AS int)        AS curr_num,
    CAST((REGEXP_MATCH(description, '(\d+)/(\d+)\s*$'))[2] AS int)        AS total_desc,
    -- Preserva o prefixo com o separador original (ex: "Vans - Nicole - ")
    REGEXP_REPLACE(description, '\d+/\d+\s*$', '')                        AS prefix
  FROM transactions
  WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
    AND total_installments   > 1
    AND installment_group_id IS NOT NULL
    AND description          ~ '\d+/\d+\s*$'
    -- Apenas séries com 1 único registro (órfãs)
    AND installment_group_id IN (
      SELECT installment_group_id
      FROM   transactions
      WHERE  owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
        AND  installment_group_id IS NOT NULL
      GROUP  BY installment_group_id
      HAVING COUNT(*) = 1
    )
)
SELECT
  gen_random_uuid(),
  owner_id,
  prefix || LPAD(n::text, 2, '0') || '/' || LPAD(total_desc::text, 2, '0'),
  amount,
  (pay_date + ((n - curr_num) * INTERVAL '1 month'))::date,
  purch_date,
  'PROJECTED',
  category_id,
  account_id,
  credit_card_id,
  NULL,
  labels,
  installment_group_id,
  total_desc,
  n,
  NULL,
  NOW(),
  NOW()
FROM solo
CROSS JOIN generate_series(1, total_desc) AS n
WHERE n <> curr_num
  AND (pay_date + ((n - curr_num) * INTERVAL '1 month'))::date >= CURRENT_DATE;
