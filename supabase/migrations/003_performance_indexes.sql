-- =============================================
-- PERFORMANCE INDEXES
-- =============================================
-- Cobrem os padrões de acesso mais frequentes:
--   WHERE owner_id = $1 AND date BETWEEN $2 AND $3
--   WHERE owner_id = $1 AND status = 'REALIZED'
--   WHERE owner_id = $1 AND date <= $2

-- entries: filtro por owner + date (list, totals, balance up-to)
create index if not exists idx_entries_owner_date
  on entries (owner_id, date);

-- entries: filtro por owner + status (v_available_balance, v_projected_balance)
create index if not exists idx_entries_owner_status
  on entries (owner_id, status);

-- entries: cobertura total para get_period_totals / get_balance_in_range
--   inclui amount para evitar heap fetch (index-only scan)
create index if not exists idx_entries_owner_date_amount
  on entries (owner_id, date) include (amount, status);

-- transactions: mesmo padrão
create index if not exists idx_transactions_owner_date
  on transactions (owner_id, date);

create index if not exists idx_transactions_owner_status
  on transactions (owner_id, status);

create index if not exists idx_transactions_owner_date_amount
  on transactions (owner_id, date) include (amount, status);

-- savings_movements: filtro por owner + date
create index if not exists idx_savings_movements_owner_date
  on savings_movements (owner_id, date);

-- accounts: filtro por owner (usado em quase toda query de saldo)
create index if not exists idx_accounts_owner
  on accounts (owner_id) where not is_archived;
