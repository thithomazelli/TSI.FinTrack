-- ─────────────────────────────────────────────────────────────────────────────
-- mark_estimated.sql
-- Marca como ESTIMATED as despesas recorrentes/estimadas de cartão de crédito.
-- Aplica apenas a registros de agosto/2026 em diante (status != 'REALIZED').
--
-- Descrições com sufixo "MM/AAAA" (ex: "Netflix - 12/2026") são casadas pelo
-- nome-base, sem fixar o mês, então cobrem todos os meses futuros.
--
-- EXECUÇÃO:
--   1. Rode o bloco de DRY RUN primeiro (SELECT) para conferir os registros.
--   2. Quando satisfeito, rode o UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── DRY RUN — rode isso primeiro ─────────────────────────────────────────────
SELECT
  id,
  date,
  description,
  amount,
  status
FROM transactions
WHERE owner_id = '69f852bc-af5a-4f11-b293-37bf2f809018'
  AND status  != 'REALIZED'
  AND date    >= '2026-08-01'
  AND (
      -- Seguros (parcelados, sem sufixo MM/AAAA)
      description ILIKE '%Tokio Marine%Seguro Residencial%'
   OR description ILIKE '%Tokio Marine%Seguro Carro%'

      -- Assinaturas sem sufixo de mês
   OR description ILIKE '%ifood Club%'
   OR description ILIKE '%iFood Club%'
   OR description ILIKE '%Apple Bill%iCloud%'
   OR description ILIKE '%Apple%Youtube Premium%'
   OR description ILIKE '%Mercado Livre Plus%'
   OR description ILIKE '%Petlove%'
   OR description ILIKE '%Cobasi%Areia%'
   OR description ILIKE '%Cobasi%Ração%'
   OR description ILIKE '%Cobasi%Racao%'
   OR description ILIKE '%Abastece a%Etanol%'

      -- Assinaturas com sufixo "MM/AAAA" — casa pelo nome-base ignorando o mês
   OR description ~ '^ClaroFlex'
   OR description ~ '^Amazon Prime'
   OR description ~ '^Spotify'
   OR description ~ '^Google Drive'
   OR description ~ '^Netflix'
  )
ORDER BY date, description;


-- ── UPDATE — rode depois de confirmar o DRY RUN ───────────────────────────────
UPDATE transactions
SET
  status     = 'ESTIMATED',
  updated_at = NOW()
WHERE owner_id = '69f852bc-af5a-4f11-b293-37bf2f809018'
  AND status  != 'REALIZED'
  AND date    >= '2026-08-01'
  AND (
      description ILIKE '%Tokio Marine%Seguro Residencial%'
   OR description ILIKE '%Tokio Marine%Seguro Carro%'
   OR description ILIKE '%ifood Club%'
   OR description ILIKE '%iFood Club%'
   OR description ILIKE '%Apple Bill%iCloud%'
   OR description ILIKE '%Apple%Youtube Premium%'
   OR description ILIKE '%Mercado Livre Plus%'
   OR description ILIKE '%Petlove%'
   OR description ILIKE '%Cobasi%Areia%'
   OR description ILIKE '%Cobasi%Ração%'
   OR description ILIKE '%Cobasi%Racao%'
   OR description ILIKE '%Abastece a%Etanol%'
   OR description ~ '^ClaroFlex'
   OR description ~ '^Amazon Prime'
   OR description ~ '^Spotify'
   OR description ~ '^Google Drive'
   OR description ~ '^Netflix'
  );
