#!/usr/bin/env node
/**
 * Marks all non-paid credit card bills up to June/2026 as PAID.
 * Requires: SUPABASE_SERVICE_ROLE_KEY env var (or uses anon key as fallback).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/settle-historical-bills.js
 */

const SUPABASE_URL = 'https://rknjcrcvsetspfvexjsu.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');
  process.exit(1);
}

const UP_TO_YEAR  = 2026;
const UP_TO_MONTH = 6;
const TARGET_STATUS = 'PAID';

async function run() {
  const url = `${SUPABASE_URL}/rest/v1/credit_card_bills` +
    `?status=neq.${TARGET_STATUS}` +
    `&or=(year.lt.${UP_TO_YEAR},and(year.eq.${UP_TO_YEAR},month.lte.${UP_TO_MONTH}))`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ status: TARGET_STATUS, updated_at: new Date().toISOString() }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`ERROR ${res.status}:`, text);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`✓ ${data.length} fatura(s) marcada(s) como PAID.`);
  if (data.length > 0) {
    data.forEach(b => console.log(`  - id=${b.id} card=${b.credit_card_id} ${b.year}/${b.month}`));
  }
}

run().catch(err => { console.error(err); process.exit(1); });
