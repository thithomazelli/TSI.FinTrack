-- Add purchase_date to transactions.
-- For credit card transactions: date = bill payment date (end of month),
-- purchase_date = actual purchase date entered by the user.
-- For debit/other transactions: purchase_date is null (date is already the purchase date).
alter table transactions add column if not exists purchase_date date;
