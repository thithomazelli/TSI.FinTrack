-- Revert: payment account is stored per-transaction (transactions.account_id),
-- not per credit card. The column added in 003 is no longer used.

alter table credit_cards
  drop column if exists account_id;
