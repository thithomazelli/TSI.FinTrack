-- ─────────────────────────────────────────────────────────────────────────────
-- 006_add_estimated_status.sql
-- Adds ESTIMATED as a third transaction/entry status.
-- ESTIMATED = expense set aside in the budget but not yet on the card/statement.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop existing CHECK constraints
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_status_check;

-- 2. Add updated constraints that include ESTIMATED
ALTER TABLE transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('REALIZED', 'PROJECTED', 'ESTIMATED'));

ALTER TABLE entries
  ADD CONSTRAINT entries_status_check
  CHECK (status IN ('REALIZED', 'PROJECTED', 'ESTIMATED'));

-- 3. Add ESTIMATED to domain_lists for all existing owners
INSERT INTO domain_lists (owner_id, code, name, value, is_system, is_default, sort_order)
SELECT
  owner_id,
  'transaction_status',
  'Estimado',
  'ESTIMATED',
  true,
  false,
  3
FROM domain_lists
WHERE code  = 'transaction_status'
  AND value = 'REALIZED'
ON CONFLICT DO NOTHING;
