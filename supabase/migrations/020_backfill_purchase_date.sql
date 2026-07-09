-- Backfill purchase_date for existing credit card transactions.
-- For imported data, the `date` column already held the purchase date
-- (parsed from the bank statement). Copy it to purchase_date so the
-- new field is populated for historical records.
update transactions
set purchase_date = date
where credit_card_id is not null
  and purchase_date is null;
