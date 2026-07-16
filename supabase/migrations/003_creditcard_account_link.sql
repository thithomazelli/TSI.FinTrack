-- Link credit cards to the bank account used to pay their bill.
-- This allows per-account balance queries to include CC transactions.

alter table credit_cards
  add column if not exists account_id uuid references accounts(id) on delete set null;
