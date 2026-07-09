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
  "Crédito Nubank", "Crédito Latam Pass", "Crédito Itaú Multi Pontos",
  "Crédito Mastercard", "Crédito Visa", "Débito Itaú",
]

// Mapeia o nome original do seed para o nome novo do cartão
const CARD_RENAME = {
  "nubank": "Crédito Nubank",
  "latam pass": "Crédito Latam Pass",
  "itaú multi pontos": "Crédito Itaú Multi Pontos",
  "mastercard": "Crédito Mastercard",
  "visa": "Crédito Visa",
}

// Transações sem cartão recebem este cartão de débito
const DEFAULT_DEBIT_CARD = "Débito Itaú"

function resolveCardName(rawName) {
  if (!rawName) return DEFAULT_DEBIT_CARD
  return CARD_RENAME[rawName.toLowerCase()] ?? rawName
}

const SEED_CATEGORIES = {
  "Alimentação/Mercado":"#f59e0b","Assinaturas":"#8b5cf6","Bike":"#10b981",
  "Celular":"#6366f1","Combustível":"#f97316","Convênio Médico":"#ec4899",
  "Cuidados Pessoais":"#f43f5e","Despesas Carro":"#78716c","Despesas Casa":"#84cc16",
  "Despesas Empresa":"#0ea5e9","Despesas Terreno":"#a3e635","Diversos":"#6b7280",
  "Empréstimo Bancário":"#dc2626","Empréstimo Pessoal":"#b91c1c","Enxoval":"#db2777",
  "Estudo":"#2563eb","Farmácia":"#16a34a","Futebol":"#15803d","Games":"#7c3aed",
  "Instrumentos":"#b45309","Investimentos":"#0d9488","Lazer":"#d97706","Médico":"#059669",
  "Parcela carro":"#475569","Pets":"#92400e","Poupança":"#065f46","Presente":"#be185d",
  "Roupas":"#9333ea","TI":"#1d4ed8","Tarifas/Juros":"#991b1b","Telefone celular":"#0369a1",
  "Transporte Público":"#1e40af","Tênis":"#7e22ce","Uber/99":"#1c1917","Viagem":"#0891b2",
}

const SEED_DOMAINS = [
  { code: 'transaction_status', name: 'Realizado', value: 'REALIZED', is_system: true, is_default: true, sort_order: 1 },
  { code: 'transaction_status', name: 'Projetado', value: 'PROJECTED', is_system: true, is_default: false, sort_order: 2 },
  { code: 'transaction_type', name: 'Débito', value: 'DEBIT', is_system: true, is_default: true, sort_order: 1 },
  { code: 'transaction_type', name: 'Crédito', value: 'CREDIT', is_system: true, is_default: false, sort_order: 2 },
  { code: 'entry_type', name: 'Salário', value: 'SALARY', is_system: false, is_default: true, sort_order: 1 },
  { code: 'entry_type', name: 'Reembolso', value: 'REIMBURSEMENT', is_system: false, is_default: false, sort_order: 2 },
  { code: 'entry_type', name: 'Transferência', value: 'TRANSFER', is_system: false, is_default: false, sort_order: 3 },
  { code: 'entry_type', name: 'Outro', value: 'OTHER', is_system: false, is_default: false, sort_order: 4 },
  { code: 'account_type', name: 'Conta Corrente', value: 'CHECKING', is_system: true, is_default: true, sort_order: 1 },
  { code: 'account_type', name: 'Poupança', value: 'SAVINGS', is_system: true, is_default: false, sort_order: 2 },
  { code: 'savings_movement_type', name: 'Depósito', value: 'DEPOSIT', is_system: true, is_default: true, sort_order: 1 },
  { code: 'savings_movement_type', name: 'Resgate', value: 'WITHDRAWAL', is_system: true, is_default: false, sort_order: 2 },
  { code: 'bill_status', name: 'Aberta', value: 'OPEN', is_system: true, is_default: true, sort_order: 1 },
  { code: 'bill_status', name: 'Fechada', value: 'CLOSED', is_system: true, is_default: false, sort_order: 2 },
  { code: 'bill_status', name: 'Paga', value: 'PAID', is_system: true, is_default: false, sort_order: 3 },
]

async function main() {
  console.log('=== TSI.FinTrack — Seed histórico ===\n')

  // 0. Domínios (listas de configuração)
  const { data: existingDomains } = await supabase
    .from('domain_lists').select('code, value').eq('owner_id', OWNER_ID)
  const domainKeys = new Set((existingDomains ?? []).map(d => `${d.code}|${d.value}`))
  const domainsToCreate = SEED_DOMAINS
    .filter(d => !domainKeys.has(`${d.code}|${d.value}`))
    .map(d => ({ owner_id: OWNER_ID, ...d }))
  if (domainsToCreate.length > 0) {
    const { error } = await supabase.from('domain_lists').insert(domainsToCreate)
    if (error) { console.error('Erro ao criar domínios:', error.message); process.exit(1) }
    console.log(`  ${domainsToCreate.length} domínios criados ✓`)
  } else {
    console.log('  Domínios já existem ✓')
  }

  // 1. Criar categorias que não existem ainda
  const { data: existingCats, error: catErr } = await supabase
    .from('categories').select('id, name').eq('owner_id', OWNER_ID)
  if (catErr) { console.error('Erro ao buscar categorias:', catErr.message); process.exit(1) }

  const existingNames = new Set(existingCats.map(c => c.name.toLowerCase()))
  const toCreate = Object.entries(SEED_CATEGORIES)
    .filter(([name]) => !existingNames.has(name.toLowerCase()))
    .map(([name, color]) => ({ owner_id: OWNER_ID, name, color, icon: null }))

  if (toCreate.length > 0) {
    const { error: insErr } = await supabase.from('categories').insert(toCreate)
    if (insErr) { console.error('Erro ao criar categorias:', insErr.message); process.exit(1) }
    console.log(`  ${toCreate.length} categorias criadas ✓`)
  }

  // Atualiza as cores das categorias que já existem (caso tenham sido criadas em cinza)
  for (const [name, color] of Object.entries(SEED_CATEGORIES)) {
    await supabase.from('categories').update({ color })
      .eq('owner_id', OWNER_ID).ilike('name', name)
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

  // debug: mostrar quais nomes do seed (já resolvidos) não encontram match
  const seedCardNames = [...new Set(data.transactions.map(t => resolveCardName(t.credit_card_name)))]
  const unmatchedCards = seedCardNames.filter(n => !cardMap[n.toLowerCase()])
  if (unmatchedCards.length) console.warn('  ⚠ Cartões sem match:', unmatchedCards)
  else console.log('  Todos os cartões do seed têm match ✓')

  // 2.5 Conta Corrente com saldo de abertura (reconciliação histórica)
  const opening = data.meta?.opening_balance ?? 0
  const { data: existingAccts } = await supabase
    .from('accounts').select('id, name').eq('owner_id', OWNER_ID)
  const acct = (existingAccts ?? []).find(a => a.name === 'Conta Corrente')
  if (!acct) {
    const { error } = await supabase.from('accounts')
      .insert({ owner_id: OWNER_ID, name: 'Conta Corrente', balance: opening })
    if (error) { console.error('Erro ao criar conta:', error.message); process.exit(1) }
    console.log(`  Conta Corrente criada (saldo abertura ${opening}) ✓`)
  } else {
    const { error: updErr } = await supabase.from('accounts').update({ balance: opening }).eq('id', acct.id)
    if (updErr) { console.error('Erro ao atualizar conta:', updErr.message); process.exit(1) }
    console.log(`  Conta Corrente saldo abertura atualizado p/ ${opening} ✓`)
  }

  // 3. Entradas de renda
  console.log('\nInserindo entradas de renda...')
  const { count: entryCount } = await supabase
    .from('entries').select('id', { count: 'exact', head: true }).eq('owner_id', OWNER_ID)
  if (entryCount > 0) {
    console.log(`  Entradas já existem (${entryCount} registros) — pulando ✓`)
  } else {
    const entries = data.entries.map(e => ({
      owner_id: e.owner_id, description: e.description,
      amount: e.amount, date: e.date, labels: e.labels ?? [], status: e.status
    }))
    await batchInsert('entries', entries, 'Entradas')
    console.log(`   ${entries.length} entradas de renda`)
  }

  // 4. Transações de despesa
  console.log('\nInserindo transações de despesa...')
  const { count: txCount } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true }).eq('owner_id', OWNER_ID)
  if (txCount > 0) {
    console.log(`  Transações já existem (${txCount} registros) — pulando ✓`)
  } else {
    const transactions = data.transactions.map(t => {
      const creditCardId = cardMap[(t.credit_card_name ?? 'Débito Itaú').toLowerCase()] ?? null
      return {
        owner_id: t.owner_id, description: t.description,
        amount: t.amount, date: t.date, labels: t.labels ?? [], status: t.status,
        // For credit card rows the statement date is the purchase date; for debit leave null
        purchase_date: creditCardId ? (t.purchase_date ?? t.date) : null,
        category_id: catMap[t.category_name?.toLowerCase()] ?? null,
        credit_card_id: creditCardId,
        account_id: null,
        installment_number: t.installment_number ?? null,
        total_installments: t.total_installments ?? null,
      }
    })
    await batchInsert('transactions', transactions, 'Transações')
    console.log(`   ${transactions.length} transações de despesa`)
  }

  console.log('\n✅ Seed concluído!')

  // 5. Backfill credit_card_bills
  console.log('\nBackfill de faturas de cartão...')
  await backfillBills()

  // 6. Marcar faturas até Jun/2026 como PAID
  console.log('\nMarcando faturas históricas como PAID...')
  await settleHistoricalBills()

  console.log('\n✅ Tudo pronto!')
}

async function backfillBills() {
  // Paginate to avoid the default 1000-row limit
  const PAGE = 1000
  let allTxs = [], offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('owner_id, credit_card_id, date')
      .not('credit_card_id', 'is', null)
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('Erro ao buscar transações:', error.message); process.exit(1) }
    allTxs = allTxs.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  const txs = allTxs
  console.log(`  ${txs.length} transações de cartão encontradas`)

  const seen = new Map()
  for (const t of txs) {
    const d = new Date(t.date)
    const year = d.getFullYear(), month = d.getMonth() + 1
    const key = `${t.credit_card_id}-${year}-${month}`
    if (!seen.has(key)) {
      const isPaid = year < 2026 || (year === 2026 && month <= 6)
      seen.set(key, {
        owner_id: t.owner_id,
        credit_card_id: t.credit_card_id,
        year, month,
        status: isPaid ? 'PAID' : 'OPEN',
        total_amount: 0,
      })
    }
  }

  const rows = [...seen.values()]
  if (rows.length === 0) { console.log('  Nenhuma fatura para criar ✓'); return }

  const BATCH = 50
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error: insErr } = await supabase
      .from('credit_card_bills')
      .upsert(chunk, { onConflict: 'credit_card_id,year,month', ignoreDuplicates: true })
    if (insErr) { console.error(`Erro no batch ${i}:`, insErr.message); process.exit(1) }
    done += chunk.length
    process.stdout.write(`\r  Faturas: ${done}/${rows.length}`)
  }
  console.log(' ✓')
}

async function settleHistoricalBills() {
  const { error } = await supabase
    .from('credit_card_bills')
    .update({ status: 'PAID', updated_at: new Date().toISOString() })
    .neq('status', 'PAID')
    .or('year.lt.2026,and(year.eq.2026,month.lte.6)')
  if (error) { console.error('Erro ao marcar faturas:', error.message); process.exit(1) }
  console.log('  Faturas históricas marcadas como PAID ✓')
}

main()
