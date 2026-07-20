-- ─────────────────────────────────────────────────────────────────────────────
-- mark_estimated.sql
-- Marks recurring/budgeted credit-card transactions as ESTIMATED.
-- Run AFTER applying migration 006_add_estimated_status.sql.
--
-- Targets transactions where:
--   • owner_id  = the user's owner ID
--   • status   != 'REALIZED'  (never touch already-realized records)
--   • description matches one of the known recurring patterns below
--
-- Execute in the Supabase SQL editor. Review the DRY-RUN SELECT first,
-- then uncomment the UPDATE when satisfied.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_owner_id UUID := '69f852bc-af5a-4f11-b293-37bf2f809018';
BEGIN

  -- ── DRY RUN ─────────────────────────────────────────────────────────────────
  -- Run this first to see which rows will be affected:
  --
  -- SELECT id, date, description, amount, status
  -- FROM transactions
  -- WHERE owner_id = v_owner_id
  --   AND status != 'REALIZED'
  --   AND (
  --       description ILIKE '%Tokio Marine%Seguro Residencial%'
  --    OR description ILIKE '%Tokio Marine%Seguro Carro%'
  --    OR description ILIKE '%ifood Club%'
  --    OR description ILIKE '%iFood Club%'
  --    OR description ILIKE '%Apple Bill%iCloud%'
  --    OR description ILIKE '%ClaroFlex%'
  --    OR description ILIKE '%Amazon Prime%'
  --    OR description ILIKE '%Youtube Premium%'
  --    OR description ILIKE '%Spotify%'
  --    OR description ILIKE '%Google Drive%'
  --    OR description ILIKE '%Netflix%'
  --    OR description ILIKE '%Mercado Livre Plus%'
  --    OR description ILIKE '%Abastece a%Etanol%'
  --    OR description ILIKE '%Cobasi%Areia%'
  --    OR description ILIKE '%Cobasi%Ração%'
  --    OR description ILIKE '%Petlove%'
  --   )
  -- ORDER BY date DESC, description;

  -- ── ACTUAL UPDATE ────────────────────────────────────────────────────────────
  UPDATE transactions
  SET
    status     = 'ESTIMATED',
    updated_at = NOW()
  WHERE owner_id = v_owner_id
    AND status  != 'REALIZED'
    AND (
        description ILIKE '%Tokio Marine%Seguro Residencial%'
     OR description ILIKE '%Tokio Marine%Seguro Carro%'
     OR description ILIKE '%ifood Club%'
     OR description ILIKE '%iFood Club%'
     OR description ILIKE '%Apple Bill%iCloud%'
     OR description ILIKE '%ClaroFlex%'
     OR description ILIKE '%Amazon Prime%'
     OR description ILIKE '%Youtube Premium%'
     OR description ILIKE '%Spotify%'
     OR description ILIKE '%Google Drive%'
     OR description ILIKE '%Netflix%'
     OR description ILIKE '%Mercado Livre Plus%'
     OR description ILIKE '%Abastece a%Etanol%'
     OR description ILIKE '%Cobasi%Areia%'
     OR description ILIKE '%Cobasi%Ração%'
     OR description ILIKE '%Cobasi%Racao%'
     OR description ILIKE '%Petlove%'
    );

  RAISE NOTICE 'Rows affected: %', (SELECT COUNT(*) FROM transactions
    WHERE owner_id = v_owner_id AND status = 'ESTIMATED');

END $$;
