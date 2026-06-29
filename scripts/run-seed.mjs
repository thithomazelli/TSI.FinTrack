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
  console.error('\nERRO: defina a variável SUPABASE_SERVICE_KEY\n')
  console.error('  SUPABASE_SERVICE_KEY="sua_chave" node scripts/run-seed.mjs\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function batchInsert(table, rows, label) {
  const BATCH = 200
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) { console.error(`\nErro em ${label} (offset ${i}):`, error.message); process.exit(1) }
    done += chunk.length
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`)
  }
  console.log(' ✓')
}

const SEED_CARDS = [
  "Nubank", "Latam Pass", "Itaú Multi Pontos", "Mastercard", "Visa",
]

const SEED_CATEGORIES = [
  "Alimentação/Mercado","Assinaturas","Bike","Celular","Combustível",
  "Convênio Médico","Cuidados Pessoais","Despesas Carro","Despesas Casa",
  "Despesas Empresa","Despesas Terreno","Diversos","Empréstimo Bancário",
  "Empréstimo Pessoal","Enxoval","Estudo","Farmácia","Futebol","Games",
  "Instrumentos","Investimentos","Lazer","Médico","Parcela carro","Pets",
  "Poupança","Presente","Roupas","TI","Tarifas/Juros","Telefone celular",
  "Transporte Público","Tênis","Uber/99","Viagem",
]

async function main() {
  console.log('=== TSI.FinTrack — Seed histórico ===\n')

  // 1. Criar categorias que não existem ainda
  const { data: existingCats, error: catErr } = await supabase
    .from('categories').select('id, name').eq('owner_id', OWNER_ID)
  if (catErr) { console.error('Erro ao buscar categorias:', catErr.message); process.exit(1) }

  const existingNames = new Set(existingCats.map(c => c.name.toLowerCase()))
  const toCreate = SEED_CATEGORIES.filter(n => !existingNames.has(n.toLowerCase()))
    .map(name => ({ owner_id: OWNER_ID, name, color: '#6b7280', icon: null }))

  if (toCreate.length > 0) {
    const { error: insErr } = await supabase.from('categories').insert(toCreate)
    if (insErr) { console.error('Erro ao criar categorias:', insErr.message); process.exit(1) }
    console.log(`  ${toCreate.length} categorias criadas ✓`)
  }

  const { data: cats, error: catSelErr } = await supabase
    .from('categories').select('id, name').eq('owner_id', OWNER_ID)
  if (catSelErr) { console.error('Erro ao buscar categorias (2):', catSelErr.message); process.exit(1) }
  const catMap = Object.fromEntries(cats.map(c => [c.name.toLowerCase(), c.id]))
  console.log(`  ${cats.length} categorias no mapa:`, cats.map(c => c.name).slice(0,5).join(', '), '...')

  // debug: mostrar quais nomes do seed não encontram match
  const seedCatNames = [...new Set(data.transactions.map(t => t.category_name).filter(Boolean))]
  const unmatchedCats = seedCatNames.filter(n => !catMap[n.toLowerCase()])
  if (unmatchedCats.length) console.warn('  ⚠ Categorias sem match:', unmatchedCats)
  else console.log('  Todas as categorias do seed têm match ✓')

  // 2. Criar cartões que não existem ainda
  const { data: existingCards, error: cardSelErr1 } = await supabase
    .from('credit_cards').select('id, name').eq('owner_id', OWNER_ID)
  if (cardSelErr1) { console.error('Erro ao buscar cartões (1):', JSON.stringify(cardSelErr1)); process.exit(1) }
  console.log(`  Cartões existentes (${existingCards.length}):`, existingCards.map(c => c.name).join(', ') || 'nenhum')

  const existingCardNames = new Set(existingCards.map(c => c.name.toLowerCase()))
  for (const name of SEED_CARDS) {
    if (existingCardNames.has(name.toLowerCase())) continue
    const { error: insErr } = await supabase.from('credit_cards').insert({
      owner_id: OWNER_ID, name, last_four_digits: '0000', credit_limit: 0, closing_day: 1, due_day: 10,
    })
    if (insErr) { console.error(`Erro ao criar cartão "${name}":`, JSON.stringify(insErr)); process.exit(1) }
    console.log(`  Cartão criado: ${name} ✓`)
  }

  const { data: cards, error: cardSelErr2 } = await supabase
    .from('credit_cards').select('id, name').eq('owner_id', OWNER_ID)
  if (cardSelErr2) { console.error('Erro ao buscar cartões (2):', JSON.stringify(cardSelErr2)); process.exit(1) }
  console.log(`  ${cards.length} cartões disponíveis:`, cards.map(c => c.name).join(', '), '✓')
  const cardMap = Object.fromEntries(cards.map(c => [c.name.toLowerCase(), c.id]))

  // debug: mostrar quais nomes do seed não encontram match
  const seedCardNames = [...new Set(data.transactions.map(t => t.credit_card_name).filter(Boolean))]
  const unmatchedCards = seedCardNames.filter(n => !cardMap[n.toLowerCase()])
  if (unmatchedCards.length) console.warn('  ⚠ Cartões sem match:', unmatchedCards)
  else console.log('  Todos os cartões do seed têm match ✓')

  // 3. Entradas de renda
  console.log('\nInserindo entradas de renda...')
  const entries = data.entries.map(e => ({
    owner_id: e.owner_id, description: e.description,
    amount: e.amount, date: e.date, labels: e.labels, status: e.status
  }))
  await batchInsert('entries', entries, 'Entradas')

  // 4. Transações de despesa
  console.log('\nInserindo transações de despesa...')
  const transactions = data.transactions.map(t => ({
    owner_id: t.owner_id, description: t.description,
    amount: t.amount, date: t.date, labels: t.labels, status: t.status,
    category_id: catMap[t.category_name?.toLowerCase()] ?? null,
    credit_card_id: cardMap[t.credit_card_name?.toLowerCase()] ?? null,
    account_id: null,
    installment_number: t.installment_number ?? null,
    total_installments: t.total_installments ?? null,
  }))
  await batchInsert('transactions', transactions, 'Transações')

  console.log('\n✅ Seed concluído!')
  console.log(`   ${entries.length} entradas de renda`)
  console.log(`   ${transactions.length} transações de despesa`)
}

main()
