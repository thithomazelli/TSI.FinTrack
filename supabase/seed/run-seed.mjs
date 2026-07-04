/**
 * TSI.FinTrack — Full database re-seed script
 *
 * Usage:
 *   SUPABASE_URL=<url> SUPABASE_SERVICE_KEY=<service_role_key> OWNER_ID=<uuid> node supabase/seed/run-seed.mjs
 *
 * The SUPABASE_SERVICE_KEY is the secret service_role key — never commit it.
 * You can also set these in a local .env file (not committed) and use dotenv.
 *
 * Steps:
 *   1. Cleans all existing user data (see seed_cleanup.sql for what is deleted)
 *   2. Seeds domain lists
 *   3. Seeds categories, accounts, credit cards
 *   4. Seeds recurring templates
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env['SUPABASE_URL'];
const SUPABASE_KEY     = process.env['SUPABASE_SERVICE_KEY']; // service_role key
const OWNER_ID         = process.env['OWNER_ID'] ?? '69f852bc-af5a-4f11-b293-37bf2f809018';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const data = JSON.parse(readFileSync(join(__dirname, 'seed_data.json'), 'utf8'));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function run(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    const result = await fn();
    console.log('✓', result ?? '');
  } catch (err) {
    console.error('✗', err.message ?? err);
    process.exit(1);
  }
}

async function insert(table, rows, returning = 'id,name') {
  const { data: inserted, error } = await supabase
    .from(table)
    .insert(rows)
    .select(returning);
  if (error) throw error;
  return inserted;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup() {
  const tables = [
    'transactions', 'entries', 'savings_movements', 'goals',
    'recurring_templates', 'credit_card_bills',
    'credit_cards', 'accounts', 'categories',
    'family_members', 'family_invites', 'domain_lists', 'people',
  ];
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().eq('owner_id', OWNER_ID);
    if (error && error.code !== 'PGRST116') throw new Error(`cleanup ${t}: ${error.message}`);
  }
  return `${tables.length} tables cleaned`;
}

// ── Domain lists ──────────────────────────────────────────────────────────────

const DOMAINS = [
  { code:'transaction_status', name:'Realizado',     value:'REALIZED',    is_system:true,  is_default:true,  sort_order:1 },
  { code:'transaction_status', name:'Projetado',     value:'PROJECTED',   is_system:true,  is_default:false, sort_order:2 },
  { code:'transaction_type',   name:'Débito',        value:'DEBIT',       is_system:true,  is_default:true,  sort_order:1 },
  { code:'transaction_type',   name:'Crédito',       value:'CREDIT',      is_system:true,  is_default:false, sort_order:2 },
  { code:'entry_type',         name:'Salário',       value:'SALARY',      is_system:false, is_default:true,  sort_order:1 },
  { code:'entry_type',         name:'Reembolso',     value:'REIMBURSEMENT',is_system:false,is_default:false, sort_order:2 },
  { code:'entry_type',         name:'Transferência', value:'TRANSFER',    is_system:false, is_default:false, sort_order:3 },
  { code:'entry_type',         name:'Outro',         value:'OTHER',       is_system:false, is_default:false, sort_order:4 },
  { code:'account_type',       name:'Conta Corrente',value:'CHECKING',    is_system:true,  is_default:true,  sort_order:1 },
  { code:'account_type',       name:'Poupança',      value:'SAVINGS',     is_system:true,  is_default:false, sort_order:2 },
  { code:'savings_movement_type',name:'Depósito',    value:'DEPOSIT',     is_system:true,  is_default:true,  sort_order:1 },
  { code:'savings_movement_type',name:'Resgate',     value:'WITHDRAWAL',  is_system:true,  is_default:false, sort_order:2 },
  { code:'bill_status',        name:'Aberta',        value:'OPEN',        is_system:true,  is_default:true,  sort_order:1 },
  { code:'bill_status',        name:'Fechada',       value:'CLOSED',      is_system:true,  is_default:false, sort_order:2 },
  { code:'bill_status',        name:'Paga',          value:'PAID',        is_system:true,  is_default:false, sort_order:3 },
];

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nTSI.FinTrack Seed — owner: ${OWNER_ID}\n`);

// 1. Clean
await run('Cleanup', cleanup);

// 2. Domain lists
await run('Domain lists', async () => {
  const rows = DOMAINS.map(d => ({ ...d, owner_id: OWNER_ID }));
  await insert('domain_lists', rows, 'id');
  return `${rows.length} domains`;
});

// 3. Categories
const categoryIdMap = {};
await run('Categories', async () => {
  const rows = data.categories.map(c => ({
    owner_id: OWNER_ID,
    name: c.name,
    color: c.color,
    icon: c.icon,
  }));
  const inserted = await insert('categories', rows, 'id,name');
  for (const c of inserted) categoryIdMap[c.name] = c.id;
  return `${inserted.length} categories`;
});

// 4. Accounts
const accountIdMap = {};
await run('Accounts', async () => {
  const rows = data.accounts.map(a => ({
    owner_id: OWNER_ID,
    name: a.name,
    type: a.type,
    balance: a.balance,
    color: a.color,
  }));
  const inserted = await insert('accounts', rows, 'id,name');
  for (const a of inserted) accountIdMap[a.name] = a.id;
  return `${inserted.length} accounts`;
});

// 5. Credit cards
const cardIdMap = {};
await run('Credit cards', async () => {
  const rows = data.creditCards.map(c => ({
    owner_id: OWNER_ID,
    name: c.name,
    limit: c.limit,
    closing_day: c.closingDay,
    due_day: c.dueDay,
    color: c.color,
  }));
  const inserted = await insert('credit_cards', rows, 'id,name');
  for (const c of inserted) cardIdMap[c.name] = c.id;
  return `${inserted.length} credit cards`;
});

// 6. Recurring templates
await run('Recurring templates', async () => {
  const rows = data.recurringTemplates.map((t, i) => ({
    owner_id: OWNER_ID,
    description: t.description,
    amount: t.amount,
    type: t.type,
    day_of_month: t.dayOfMonth,
    frequency: t.frequency,
    months: t.months,
    is_active: t.isActive,
    category_id: t.categoryRef ? (categoryIdMap[t.categoryRef] ?? null) : null,
    account_id: t.accountRef ? (accountIdMap[t.accountRef] ?? null) : null,
    credit_card_id: t.creditCardRef ? (cardIdMap[t.creditCardRef] ?? null) : null,
    position: (i + 1) * 10,
  }));
  const inserted = await insert('recurring_templates', rows, 'id');
  return `${inserted.length} templates`;
});

console.log('\nSeed completed successfully!\n');
