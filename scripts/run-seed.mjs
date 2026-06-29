// Rodar: SUPABASE_SERVICE_KEY=<sua_chave> node scripts/run-seed.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(__dir, 'seed_data.json'), 'utf8'))

const SUPABASE_URL = 'https://rknjcrcvsetspfvexjsu.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const OWNER_ID = '69f852bc-af5a-4f11-b293-37bf2f809018'

if (!SERVICE_KEY) {
  console.error('\nERRO: defina a variável de ambiente SUPABASE_SERVICE_KEY\n')
  console.error('Windows PowerShell:')
  console.error('  $env:SUPABASE_SERVICE_KEY="sua_chave_aqui"')
  console.error('  node scripts/run-seed.mjs\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function batchInsert(table, rows, label) {
  const BATCH = 200
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) {
      console.error(`\nErro em ${label} (offset ${i}):`, error.message)
      process.exit(1)
    }
    done += chunk.length
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`)
  }
  console.log(' ✓')
}

async function main() {
  console.log('=== TSI.FinTrack — Seed histórico ===\n')

  // 1. Buscar categorias do usuário
  console.log('Buscando categorias...')
  const { data: cats, error: catErr } = await supabase
    .from('categories')
    .select('id, name')
    .eq('owner_id', OWNER_ID)
  if (catErr) { console.error('Erro ao buscar categorias:', catErr.message); process.exit(1) }
  const catMap = Object.fromEntries(cats.map(c => [c.name.toLowerCase(), c.id]))
  console.log(`  ${cats.length} categorias encontradas ✓`)

  // 2. Inserir entradas (renda)
  console.log('\nInserindo entradas de renda...')
  const entries = data.entries.map(e => ({
    owner_id: e.owner_id,
    description: e.description,
    amount: e.amount,
    date: e.date,
    labels: e.labels,
    status: e.status
  }))
  await batchInsert('entries', entries, 'Entradas')

  // 3. Inserir transações (despesas)
  console.log('\nInserindo transações de despesa...')
  const transactions = data.transactions.map(t => ({
    owner_id: t.owner_id,
    description: t.description,
    amount: t.amount,
    date: t.date,
    category_id: catMap[t._cat_name?.toLowerCase()] ?? null,
    account_id: null,
    credit_card_id: null,
    status: t.status,
    labels: t.labels
  }))
  await batchInsert('transactions', transactions, 'Transações')

  console.log('\n✅ Seed concluído!')
  console.log(`   ${entries.length} entradas de renda`)
  console.log(`   ${transactions.length} transações de despesa`)
}

main()
