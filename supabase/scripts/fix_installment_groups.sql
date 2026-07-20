-- ─────────────────────────────────────────────────────────────────────────────
-- fix_installment_groups.sql
-- Corrige parcelas sem installment_group_id.
--
-- Contexto: o DRY RUN revelou que TODOS os grupos têm exatamente 1 parcela
-- encontrada — as demais simplesmente não foram importadas. Portanto não há
-- registros para "vincular": cada registro vira seu próprio grupo (group_id
-- único), e o installment_number é extraído do sufixo da descrição ("XX/YY").
--
-- EXECUÇÃO:
--   1. Rode o DRY RUN para conferir antes.
--   2. Execute o UPDATE dentro do BEGIN/COMMIT quando satisfeito.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── DRY RUN ───────────────────────────────────────────────────────────────────
SELECT
  id,
  description,
  date,
  amount,
  credit_card_id,
  total_installments,
  installment_number                                       AS num_atual,
  -- Extrai o número da parcela do sufixo "XX/YY" na descrição
  CAST(
    (REGEXP_MATCH(description, '(\d+)/(\d+)\s*$'))[1]
    AS integer
  )                                                        AS num_extraido,
  installment_group_id
FROM transactions
WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
  AND total_installments   > 1
  AND installment_group_id IS NULL
ORDER BY description, date;


-- ── UPDATE ────────────────────────────────────────────────────────────────────
BEGIN;

UPDATE transactions
SET
  installment_group_id = gen_random_uuid(),   -- UUID único por linha (cada orfão vira seu próprio grupo)
  installment_number   = COALESCE(
    CAST(
      (REGEXP_MATCH(description, '(\d+)/(\d+)\s*$'))[1]
      AS integer
    ),
    installment_number  -- mantém o valor atual se o regex não casar
  ),
  updated_at           = NOW()
WHERE owner_id             = '69f852bc-af5a-4f11-b293-37bf2f809018'
  AND total_installments   > 1
  AND installment_group_id IS NULL;

-- Verifique o número de linhas afetadas (esperado ~130), depois:
-- COMMIT;   ← confirma
-- ROLLBACK; ← cancela se algo não parecer certo
