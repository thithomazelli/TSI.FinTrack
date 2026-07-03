#!/usr/bin/env node
/**
 * Backfill credit_card_bills for all months that have transactions but no bill record.
 * Status: PAID for months <= June/2026, OPEN for July/2026 onwards.
 * Safe to re-run (uses ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/backfill-credit-card-bills.js
 */

const SUPABASE_URL = 'https://rknjcrcvsetspfvexjsu.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SQL = `
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
    WHEN EXTRACT(YEAR  FROM t.date) < 2026                                      THEN 'PAID'
    WHEN EXTRACT(YEAR  FROM t.date) = 2026 AND EXTRACT(MONTH FROM t.date) <= 6 THEN 'PAID'
    ELSE 'OPEN'
  END AS status,
  0 AS total_amount,
  NOW() AS created_at,
  NOW() AS updated_at
FROM transactions t
WHERE t.credit_card_id IS NOT NULL
GROUP BY t.owner_id, t.credit_card_id, year, month
ON CONFLICT (credit_card_id, year, month) DO NOTHING;
`;

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  });

  // Supabase doesn't expose a generic SQL endpoint via REST — use the pg endpoint instead
  if (res.status === 404) {
    return runViaPg();
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`ERROR ${res.status}:`, text);
    process.exit(1);
  }

  console.log('✓ Backfill concluído.');
}

async function runViaPg() {
  const res = await fetch(`${SUPABASE_URL}/pg`, {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  });

  if (!res.ok) {
    const text = await res.text();

    // Neither endpoint worked — fall back to inserting row by row via REST
    if (res.status === 404) {
      console.log('ℹ️  Endpoint SQL direto não disponível. Usando inserção via REST...');
      return runViaRest();
    }

    console.error(`ERROR ${res.status}:`, text);
    process.exit(1);
  }

  console.log('✓ Backfill concluído.');
}

async function runViaRest() {
  // 1. Fetch all credit card transactions
  const txRes = await fetch(
    `${SUPABASE_URL}/rest/v1/transactions?select=owner_id,credit_card_id,date&credit_card_id=not.is.null`,
    {
      headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Prefer': 'count=none' },
    }
  );
  if (!txRes.ok) { console.error('Failed to fetch transactions:', await txRes.text()); process.exit(1); }
  const txs = await txRes.json();

  // 2. Deduplicate by (owner_id, credit_card_id, year, month)
  const seen = new Map();
  for (const t of txs) {
    const d = new Date(t.date);
    const year = d.getFullYear(), month = d.getMonth() + 1;
    const key = `${t.credit_card_id}-${year}-${month}`;
    if (!seen.has(key)) {
      const isPaid = year < 2026 || (year === 2026 && month <= 6);
      seen.set(key, {
        owner_id: t.owner_id,
        credit_card_id: t.credit_card_id,
        year, month,
        status: isPaid ? 'PAID' : 'OPEN',
        total_amount: 0,
      });
    }
  }

  const rows = [...seen.values()];
  if (rows.length === 0) { console.log('Nenhuma fatura para criar.'); return; }

  // 3. Upsert in batches of 50
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/credit_card_bills`, {
      method: 'POST',
      headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) { console.error(`Batch ${i} failed:`, await res.text()); process.exit(1); }
    inserted += batch.length;
  }

  console.log(`✓ ${inserted} fatura(s) processada(s) (duplicatas ignoradas).`);
}

run().catch(err => { console.error(err); process.exit(1); });
