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
import { readFileSync, existsSync } from 'fs';
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

const txDataPath = join(__dirname, 'transactions_data.json');
const txData = existsSync(txDataPath)
  ? JSON.parse(readFileSync(txDataPath, 'utf8'))
  : null;

const BATCH = 200;

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

async function deleteInBatches(table) {
  let total = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select('id').eq('owner_id', OWNER_ID).limit(200);
    if (error) throw new Error(`cleanup ${table} (select): ${error.message}`);
    if (!data || data.length === 0) break;
    const ids = data.map(r => r.id);
    const { error: delError } = await supabase.from(table).delete().in('id', ids);
    if (delError) throw new Error(`cleanup ${table} (delete): ${delError.message}`);
    total += ids.length;
  }
  return total;
}

async function cleanup() {
  const tables = [
    'transactions', 'entries', 'savings_movements', 'goals',
    'recurring_templates', 'credit_card_bills',
    'credit_cards', 'accounts', 'categories',
    'family_members', 'family_invites', 'domain_lists', 'people',
  ];
  let totalDeleted = 0;
  for (const t of tables) {
    const count = await deleteInBatches(t);
    if (count > 0) process.stdout.write(`\n    ${t}: ${count} rows`);
    totalDeleted += count;
  }
  return `${tables.length} tables cleaned (${totalDeleted} rows)`;
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
const savingsTypeIdMap = {};
const accountTypeIdMap = {};
await run('Domain lists', async () => {
  const rows = DOMAINS.map(d => ({ ...d, owner_id: OWNER_ID }));
  const inserted = await insert('domain_lists', rows, 'id,code,value');
  for (const d of inserted) {
    if (d.code === 'savings_movement_type') savingsTypeIdMap[d.value] = d.id;
    if (d.code === 'account_type') accountTypeIdMap[d.value] = d.id;
  }
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
    type_id: accountTypeIdMap[a.type] ?? null,
    balance: a.balance,
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
    credit_limit: c.limit,
    closing_day: c.closingDay,
    due_day: c.dueDay,
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

// 7. Open bills for current month (always, regardless of transactions_data.json)
await run('Current-month bills (OPEN)', async () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const pad = n => String(n).padStart(2, '0');
  const rows = data.creditCards.map(c => {
    const cardId = cardIdMap[c.name];
    if (!cardId) return null;
    const closingDate = `${y}-${pad(m)}-${pad(c.closingDay)}`;
    let dueYear = y, dueMonth = m;
    if (c.dueDay < c.closingDay) {
      dueMonth++;
      if (dueMonth > 12) { dueMonth = 1; dueYear++; }
    }
    const dueDate = `${dueYear}-${pad(dueMonth)}-${pad(c.dueDay)}`;
    return { owner_id: OWNER_ID, credit_card_id: cardId, year: y, month: m, total_amount: 0, closing_date: closingDate, due_date: dueDate, status: 'OPEN' };
  }).filter(Boolean);
  const { error } = await supabase.from('credit_card_bills').upsert(rows, { onConflict: 'credit_card_id,year,month', ignoreDuplicates: true });
  if (error) throw error;
  return `${rows.length} bills (${y}/${pad(m)})`;
});

if (!txData) {
  console.log('\n  (transactions_data.json not found — skipping entries/transactions/savings)\n');
} else {
  // Build case-insensitive category lookup
  const catLookup = {};
  for (const [name, id] of Object.entries(categoryIdMap)) {
    catLookup[name.toLowerCase()] = id;
  }

  async function insertBatched(table, rows) {
    let count = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      await insert(table, rows.slice(i, i + BATCH), 'id');
      count += rows.slice(i, i + BATCH).length;
      process.stdout.write(`\r    ${count}/${rows.length}`);
    }
    process.stdout.write('\n');
    return count;
  }

  // 7. Entries
  await run('Entries', async () => {
    const defaultAccountId = accountIdMap['Itaú'];
    const rows = (txData.entries ?? []).map(e => ({
      owner_id:   OWNER_ID,
      description: e.description,
      amount:      e.amount,
      date:        e.date,
      status:      e.status,
      account_id:  defaultAccountId,
      labels:      e.labels ?? [],
      position:    e.position ?? null,
    }));
    const count = await insertBatched('entries', rows);
    return `${count} entries`;
  });

  // 8. Transactions
  await run('Transactions', async () => {
    const defaultAccountId = accountIdMap['Itaú'];
    const missing = new Set();
    const rows = (txData.transactions ?? []).map(t => {
      const cardId = t.credit_card_name ? (cardIdMap[t.credit_card_name] ?? null) : null;
      const catId  = t.category_name
        ? (catLookup[t.category_name.toLowerCase()] ?? null)
        : null;
      if (t.category_name && !catId) missing.add(t.category_name);
      const accountId = t.account_name
        ? (accountIdMap[t.account_name] ?? defaultAccountId)
        : defaultAccountId;
      return {
        owner_id:              OWNER_ID,
        description:           t.description,
        amount:                t.amount,
        date:                  t.date,
        purchase_date:         t.purchase_date ?? null,
        category_id:           catId,
        account_id:            accountId,
        credit_card_id:        cardId,
        status:                t.status,
        installment_number:    t.installment_number ?? null,
        total_installments:    t.total_installments ?? null,
        installment_group_id:  t.installment_group_id ?? null,
        labels:                t.labels ?? [],
        position:              t.position ?? null,
      };
    });
    const count = await insertBatched('transactions', rows);
    if (missing.size) console.log(`\n    ⚠ categories not found (saved as null): ${[...missing].join(', ')}`);
    return `${count} transactions`;
  });

  // 9. Savings movements
  await run('Savings movements', async () => {
    const savingsAccountId = accountIdMap['Poupança'];
    if (!savingsAccountId) return 'skipped (no Poupança account)';
    const rows = (txData.savings ?? []).map(s => ({
      owner_id:    OWNER_ID,
      description: s.description,
      amount:      s.amount,
      date:        s.date,
      type_id:     savingsTypeIdMap[s.type] ?? null,
      account_id:  savingsAccountId,
    }));
    const count = await insertBatched('savings_movements', rows);
    return `${count} savings movements`;
  });
}

// 10. Credit card bills — derived from transactions already in the DB.
//     Runs outside the txData block so it always executes after step 8.
await run('Credit card bills (all months)', async () => {
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // card UUID → { closingDay, dueDay }
  const cardConf = {};
  for (const c of data.creditCards) {
    const id = cardIdMap[c.name];
    if (id) cardConf[id] = { closingDay: c.closingDay, dueDay: c.dueDay };
  }

  // Paginate through ALL transactions for this owner (filter CC ones in JS to avoid PostgREST null quirks)
  let allCcTxs = [];
  let rangeStart = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page, error } = await supabase
      .from('transactions')
      .select('credit_card_id, date, amount')
      .eq('owner_id', OWNER_ID)
      .range(rangeStart, rangeStart + PAGE - 1);
    if (error) throw error;
    const batch = (page ?? []).filter(t => t.credit_card_id !== null && t.credit_card_id !== undefined);
    allCcTxs = allCcTxs.concat(batch);
    if (!page || page.length < PAGE) break;
    rangeStart += PAGE;
  }

  if (!allCcTxs.length) return '0 bills (no CC transactions found in DB)';

  // Aggregate per (credit_card_id, year, month)
  const billMap = new Map();
  for (const t of allCcTxs) {
    const parts = t.date.split('-');
    const y = parseInt(parts[0], 10), mo = parseInt(parts[1], 10);
    const key = `${t.credit_card_id}|${y}|${mo}`;
    if (!billMap.has(key)) billMap.set(key, { cardId: t.credit_card_id, year: y, month: mo, total: 0 });
    billMap.get(key).total += Number(t.amount);
  }

  const pad = n => String(n).padStart(2, '0');
  const rows = [];
  for (const { cardId, year, month, total } of billMap.values()) {
    const conf = cardConf[cardId] ?? { closingDay: 1, dueDay: 10 };
    const closingDate = `${year}-${pad(month)}-${pad(conf.closingDay)}`;
    let dueYear = year, dueMonth = month;
    if (conf.dueDay < conf.closingDay) { dueMonth++; if (dueMonth > 12) { dueMonth = 1; dueYear++; } }
    const dueDate = `${dueYear}-${pad(dueMonth)}-${pad(conf.dueDay)}`;
    const isPast = year < currentYear || (year === currentYear && month < currentMonth);
    rows.push({
      owner_id:       OWNER_ID,
      credit_card_id: cardId,
      year, month,
      total_amount:   Math.round(total * 100) / 100,
      closing_date:   closingDate,
      due_date:       dueDate,
      status:         isPast ? 'PAID' : 'OPEN',
    });
  }

  // Upsert in batches (updates total_amount on current-month bill created in step 7)
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from('credit_card_bills')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'credit_card_id,year,month' });
    if (error) throw error;
    count += rows.slice(i, i + BATCH).length;
  }
  return `${count} bills across ${new Set(rows.map(r => `${r.year}-${r.month}`)).size} months`;
});

console.log('\nSeed completed successfully!\n');
