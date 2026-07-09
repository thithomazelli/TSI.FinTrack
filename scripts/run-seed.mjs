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
  { name: 'Crédito Nubank',           last_four_digits: '1998', credit_limit: 15450,  closing_day: 21, due_day: 29, is_archived: false },
  { name: 'Crédito Latam Pass',       last_four_digits: '2550', credit_limit: 83820,  closing_day: 19, due_day: 27, is_archived: false },
  { name: 'Crédito Itaú Multi Pontos',last_four_digits: '9367', credit_limit: 15000,  closing_day: 21, due_day: 27, is_archived: false },
  { name: 'Crédito Mastercard',       last_four_digits: '0000', credit_limit: 0,      closing_day:  1, due_day: 10, is_archived: true  },
  { name: 'Crédito Visa',             last_four_digits: '0000', credit_limit: 0,      closing_day:  1, due_day: 10, is_archived: true  },
  { name: 'Débito Itaú',             last_four_digits: '9367', credit_limit: 0,      closing_day:  1, due_day: 10, is_archived: false },
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

// Recurring templates — category_name and credit_card_name resolved at runtime
const SEED_RECURRING = [
  // ── Entradas ──────────────────────────────────────────────────────────────
  { description: 'Nicole - Pagto Contas',         amount: 2000.00,   type: 'ENTRY',       day_of_month:  5, frequency: 'monthly',  months: [],   is_active: true,  position:   8.125, category_name: null,             credit_card_name: null },
  { description: 'RDI - Salário',                 amount: 17332.55,  type: 'ENTRY',       day_of_month:  5, frequency: 'monthly',  months: [],   is_active: true,  position:  18.125, category_name: null,             credit_card_name: null },
  { description: 'Pagto Mãe - Convênio',          amount: 315.00,    type: 'ENTRY',       day_of_month:  5, frequency: 'monthly',  months: [],   is_active: true,  position:  30,     category_name: 'Convênio Médico', credit_card_name: null },
  { description: 'RDI - Férias',                  amount: 10100.97,  type: 'ENTRY',       day_of_month:  5, frequency: 'sporadic', months: [3],  is_active: true,  position:  40,     category_name: null,             credit_card_name: null },
  { description: 'RDI - 1/3 Férias',              amount: 3366.99,   type: 'ENTRY',       day_of_month:  5, frequency: 'sporadic', months: [3],  is_active: true,  position:  50,     category_name: null,             credit_card_name: null },
  { description: 'RDI - Abono pecuniário',         amount: 6733.98,   type: 'ENTRY',       day_of_month:  5, frequency: 'sporadic', months: [3],  is_active: true,  position:  60,     category_name: null,             credit_card_name: null },
  { description: 'RDI - 1/3 Abono pecuniário',    amount: 2244.65,   type: 'ENTRY',       day_of_month:  5, frequency: 'sporadic', months: [3],  is_active: true,  position:  70,     category_name: null,             credit_card_name: null },
  { description: 'RDI - INSS (desconto férias)',   amount: -988.07,   type: 'ENTRY',       day_of_month:  5, frequency: 'sporadic', months: [3],  is_active: true,  position:  80,     category_name: null,             credit_card_name: null },
  { description: 'RDI - IRRF (desconto férias)',   amount: -3088.38,  type: 'ENTRY',       day_of_month:  5, frequency: 'sporadic', months: [3],  is_active: true,  position:  90,     category_name: null,             credit_card_name: null },
  { description: 'RDI - 13º Salário - 01/02',     amount: 10100.98,  type: 'ENTRY',       day_of_month: 20, frequency: 'sporadic', months: [6],  is_active: true,  position: 100,     category_name: null,             credit_card_name: null },
  { description: 'FGTS - Saque Aniversário',       amount: 1130.68,   type: 'ENTRY',       day_of_month: 15, frequency: 'sporadic', months: [7],  is_active: true,  position: 110,     category_name: null,             credit_card_name: null },
  { description: 'RDI - 13º Salário - 02/02',     amount: 4408.71,   type: 'ENTRY',       day_of_month: 20, frequency: 'sporadic', months: [12], is_active: true,  position: 120,     category_name: null,             credit_card_name: null },
  // ── Transações ────────────────────────────────────────────────────────────
  { description: 'Sem Parar',                      amount: 20.67,     type: 'TRANSACTION', day_of_month:  5, frequency: 'monthly',  months: [],   is_active: true,  position: 130,     category_name: null,             credit_card_name: null },
  { description: 'Conta Água',                     amount: 200.00,    type: 'TRANSACTION', day_of_month: 10, frequency: 'monthly',  months: [],   is_active: true,  position: 140,     category_name: null,             credit_card_name: null },
  { description: 'Conta Luz',                      amount: 500.00,    type: 'TRANSACTION', day_of_month: 10, frequency: 'monthly',  months: [],   is_active: true,  position: 150,     category_name: null,             credit_card_name: null },
  { description: 'Conta Net',                      amount: 200.00,    type: 'TRANSACTION', day_of_month: 10, frequency: 'monthly',  months: [],   is_active: true,  position: 160,     category_name: null,             credit_card_name: null },
  { description: 'English Class - Tatiana Elman',  amount: 1300.00,   type: 'TRANSACTION', day_of_month:  5, frequency: 'monthly',  months: [],   is_active: true,  position: 170,     category_name: 'Estudo',         credit_card_name: null },
  { description: 'Financiamento Onix 2022',        amount: 2242.32,   type: 'TRANSACTION', day_of_month: 15, frequency: 'monthly',  months: [],   is_active: true,  position: 180,     category_name: null,             credit_card_name: null },
  { description: 'Convênio Mãe',                   amount: 941.66,    type: 'TRANSACTION', day_of_month:  5, frequency: 'monthly',  months: [],   is_active: true,  position: 190,     category_name: 'Convênio Médico', credit_card_name: null },
  { description: 'Casa Santo André - Aluguel',     amount: 2500.00,   type: 'TRANSACTION', day_of_month: 10, frequency: 'monthly',  months: [],   is_active: true,  position: 200,     category_name: null,             credit_card_name: null },
  { description: 'Obra Maragogi - INSS',           amount: 267.69,    type: 'TRANSACTION', day_of_month: 20, frequency: 'monthly',  months: [],   is_active: true,  position: 210,     category_name: null,             credit_card_name: null },
  { description: 'Anuidade Cartão Latam Pass',     amount: 100.00,    type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 220,     category_name: 'Tarifas/Juros',  credit_card_name: 'Crédito Latam Pass' },
  { description: 'Premiere - Assinatura',          amount: 29.90,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 230,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Ifood / Mercado / Comidas',      amount: 0.00,      type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 240,     category_name: null,             credit_card_name: 'Crédito Latam Pass' },
  { description: 'Ifood Club',                     amount: 7.95,      type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 250,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Apple iCloud+',                  amount: 66.90,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 260,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'ClaroFlex',                      amount: 49.99,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 270,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Amazon Prime',                   amount: 19.90,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 280,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Youtube Premium',                amount: 69.90,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 290,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Spotify',                        amount: 40.90,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 300,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Google Drive - Thiago',          amount: 9.99,      type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 310,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Google Drive - Nicole',          amount: 9.99,      type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 320,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Netflix',                        amount: 59.90,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 330,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Mercado Livre Plus',             amount: 14.99,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 340,     category_name: 'Assinaturas',    credit_card_name: 'Crédito Latam Pass' },
  { description: 'Auto Posto - Etanol',            amount: 500.00,    type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 350,     category_name: null,             credit_card_name: 'Crédito Latam Pass' },
  { description: 'Cobasi - Areia p/ Gatos',        amount: 105.89,    type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 360,     category_name: 'Pets',           credit_card_name: 'Crédito Latam Pass' },
  { description: 'Cobasi - Ração p/ Gatos',        amount: 180.70,    type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 370,     category_name: 'Pets',           credit_card_name: 'Crédito Latam Pass' },
  { description: 'Tokio Marine - Seguro Carro',    amount: 214.88,    type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 380,     category_name: null,             credit_card_name: 'Crédito Latam Pass' },
  { description: 'Tokio Marine - Seguro Residencial', amount: 57.18,  type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 390,     category_name: null,             credit_card_name: 'Crédito Latam Pass' },
  { description: 'Petlove - Plano p/ Gatos',       amount: 36.06,     type: 'TRANSACTION', day_of_month: 17, frequency: 'monthly',  months: [],   is_active: true,  position: 400,     category_name: 'Pets',           credit_card_name: 'Crédito Latam Pass' },
]

async function seedRecurring(catMap, cardMap) {
  const { count } = await supabase
    .from('recurring_templates').select('id', { count: 'exact', head: true }).eq('owner_id', OWNER_ID)
  if (count > 0) {
    console.log(`  Templates já existem (${count}) — pulando ✓`)
    return
  }
  const rows = SEED_RECURRING.map(r => ({
    owner_id:      OWNER_ID,
    description:   r.description,
    amount:        r.amount,
    type:          r.type,
    day_of_month:  r.day_of_month,
    frequency:     r.frequency,
    months:        r.months,
    is_active:     r.is_active,
    position:      r.position,
    category_id:   r.category_name ? (catMap[r.category_name.toLowerCase()] ?? null) : null,
    credit_card_id: r.credit_card_name ? (cardMap[r.credit_card_name.toLowerCase()] ?? null) : null,
    account_id:    null,
  }))
  const { error } = await supabase.from('recurring_templates').insert(rows)
  if (error) { console.error('Erro ao inserir recorrentes:', error.message); process.exit(1) }
  console.log(`  ${rows.length} templates recorrentes criados ✓`)
}

const RESET_SAVINGS = process.argv.includes('--reset-savings')

async function main() {
  console.log('=== TSI.FinTrack — Seed histórico ===\n')
  if (RESET_SAVINGS) console.log('⚠  Modo --reset-savings: limpando savings_movements antes de reinserir\n')

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
  for (const card of SEED_CARDS) {
    if (existingCardNames.has(card.name.toLowerCase())) {
      // Update real metadata in case it was created with placeholder values
      await supabase.from('credit_cards').update({
        last_four_digits: card.last_four_digits,
        credit_limit: card.credit_limit,
        closing_day: card.closing_day,
        due_day: card.due_day,
        is_archived: card.is_archived,
      }).eq('owner_id', OWNER_ID).ilike('name', card.name)
      continue
    }
    const { error: insErr } = await supabase.from('credit_cards').insert({
      owner_id: OWNER_ID, ...card,
    })
    if (insErr) { console.error(`Erro ao criar cartão "${card.name}":`, JSON.stringify(insErr)); process.exit(1) }
    console.log(`  Cartão criado: ${card.name} ✓`)
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
  const opening = data.meta?.opening_balance ?? -305
  const openedAt = data.meta?.opened_at ?? '2009-05-01'
  const { data: checkingDomain } = await supabase
    .from('domain_lists').select('id').eq('owner_id', OWNER_ID).eq('code', 'account_type').eq('value', 'CHECKING').maybeSingle()
  const checkingTypeId = checkingDomain?.id ?? null
  const { data: existingAccts } = await supabase
    .from('accounts').select('id, name').eq('owner_id', OWNER_ID)
  const acct = (existingAccts ?? []).find(a => a.name === 'Conta Corrente')
  if (!acct) {
    const { error } = await supabase.from('accounts')
      .insert({ owner_id: OWNER_ID, name: 'Conta Corrente', type_id: checkingTypeId, balance: opening, opened_at: openedAt })
    if (error) { console.error('Erro ao criar conta:', error.message); process.exit(1) }
    console.log(`  Conta Corrente criada (saldo ${opening}, abertura ${openedAt}) ✓`)
  } else {
    const { error: updErr } = await supabase.from('accounts').update({ type_id: checkingTypeId, balance: opening, opened_at: openedAt }).eq('id', acct.id)
    if (updErr) { console.error('Erro ao atualizar conta:', updErr.message); process.exit(1) }
    console.log(`  Conta Corrente saldo atualizado p/ ${opening} (abertura ${openedAt}) ✓`)
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
      amount: e.amount, date: e.date, labels: e.labels ?? [], status: e.status,
      position: e.position ?? null,
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
        position: t.position ?? null,
      }
    })
    await batchInsert('transactions', transactions, 'Transações')
    console.log(`   ${transactions.length} transações de despesa`)
  }

  // 5. Movimentos de poupança
  console.log('\nInserindo movimentos de poupança...')
  if (RESET_SAVINGS) {
    const { error: delErr } = await supabase.from('savings_movements').delete().eq('owner_id', OWNER_ID)
    if (delErr) { console.error('Erro ao limpar savings_movements:', delErr.message); process.exit(1) }
    console.log('  savings_movements limpos ✓')
  }
  const { count: savingsCount } = await supabase
    .from('savings_movements').select('id', { count: 'exact', head: true }).eq('owner_id', OWNER_ID)
  if (!RESET_SAVINGS && savingsCount > 0) {
    console.log(`  Movimentos já existem (${savingsCount} registros) — pulando ✓`)
  } else if ((data.savings ?? []).length === 0) {
    console.log('  Nenhum movimento de poupança no seed — pulando ✓')
  } else {
    const { data: depositDomain }    = await supabase.from('domain_lists').select('id').eq('owner_id', OWNER_ID).eq('code', 'savings_movement_type').eq('value', 'DEPOSIT').maybeSingle()
    const { data: withdrawalDomain } = await supabase.from('domain_lists').select('id').eq('owner_id', OWNER_ID).eq('code', 'savings_movement_type').eq('value', 'WITHDRAWAL').maybeSingle()
    const { data: savingsDomain }    = await supabase.from('domain_lists').select('id').eq('owner_id', OWNER_ID).eq('code', 'account_type').eq('value', 'SAVINGS').maybeSingle()

    const depositTypeId    = depositDomain?.id ?? null
    const withdrawalTypeId = withdrawalDomain?.id ?? null

    // Garante que a conta Poupança Nubank existe
    let { data: savingsAcct } = await supabase.from('accounts').select('id').eq('owner_id', OWNER_ID).eq('name', 'Poupança Nubank').maybeSingle()
    if (!savingsAcct) {
      const { data: created, error: accErr } = await supabase.from('accounts')
        .insert({ owner_id: OWNER_ID, name: 'Poupança Nubank', type_id: savingsDomain?.id ?? null, balance: 0 })
        .select('id').single()
      if (accErr) { console.error('Erro ao criar conta Poupança Nubank:', accErr.message); process.exit(1) }
      savingsAcct = created
      console.log('  Conta Poupança Nubank criada ✓')
    }
    const savingsAccountId = savingsAcct?.id ?? null

    const rows = data.savings.map(s => ({
      owner_id:   OWNER_ID,
      description: s.description,
      amount:      Math.abs(s.amount),
      date:        s.date,
      type_id:     s.type === 'WITHDRAWAL' ? withdrawalTypeId : depositTypeId,
      account_id:  savingsAccountId,
    }))
    await batchInsert('savings_movements', rows, 'Poupança')
    console.log(`   ${rows.length} movimentos de poupança`)
  }

  console.log('\n✅ Seed concluído!')

  // 7. Recorrentes
  console.log('\nInserindo templates recorrentes...')
  await seedRecurring(catMap, cardMap)

  // 8. Backfill credit_card_bills
  console.log('\nBackfill de faturas de cartão...')
  await backfillBills()

  // 9. Marcar faturas até Jun/2026 como PAID
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
