-- Backfill credit_card_bills for all months that have transactions but no bill record.
-- Status: PAID for months <= June/2026, OPEN for July/2026 onwards.
-- Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING.

INSERT INTO credit_card_bills (
  owner_id,
  credit_card_id,
  year,
  month,
  status,
  total_amount,
  created_at,
  updated_at
)
SELECT
  t.owner_id,
  t.credit_card_id,
  EXTRACT(YEAR  FROM t.date)::int AS year,
  EXTRACT(MONTH FROM t.date)::int AS month,
  CASE
    WHEN EXTRACT(YEAR  FROM t.date) < 2026                                          THEN 'PAID'
    WHEN EXTRACT(YEAR  FROM t.date) = 2026 AND EXTRACT(MONTH FROM t.date) <= 6     THEN 'PAID'
    ELSE 'OPEN'
  END AS status,
  0 AS total_amount,
  NOW() AS created_at,
  NOW() AS updated_at
FROM transactions t
WHERE t.credit_card_id IS NOT NULL
GROUP BY t.owner_id, t.credit_card_id, year, month
ON CONFLICT (credit_card_id, year, month) DO NOTHING;
