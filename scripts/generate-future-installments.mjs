/**
 * Gera as parcelas futuras que ainda não existem no banco.
 *
 * Para cada grupo de parcelamento (installment_group_id):
 *   - Conta quantas parcelas estão registradas
 *   - Se registered < total_installments, projeta as faltantes a partir da última data
 *   - Incrementa 1 mês por parcela mantendo o mesmo dia
 *   - Status: PROJECTED
 *
 * Uso:
 *   SUPABASE_SERVICE_KEY=<key> node scripts/generate-future-installments.mjs
 *   SUPABASE_SERVICE_KEY=<key> node scripts/generate-future-installments.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SUPABASE_URL = 'https://rknjcrcvsetspfvexjsu.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const OWNER_ID     = '69f852bc-af5a-4f11-b293-37bf2f809018'
const DRY_RUN      = process.argv.includes('--dry-run')

if (!SERVICE_KEY) {
  console.error('\nERRO: defina SUPABASE_SERVICE_KEY\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function addMonths(dateStr, months) {
  // dateStr: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS'
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00')
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // Clamp to last day of month (e.g. Jan 31 + 1 month → Feb 28)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d.toISOString().slice(0, 10)
}

async function loadAllInstallments() {
  const PAGE = 1000
  let all = [], offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, description, date, amount, category_id, credit_card_id, credit_card_bill_id, account_id, installment_number, total_installments, installment_group_id, labels, position')
      .eq('owner_id', OWNER_ID)
      .gt('total_installments', 1)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('Erro ao carregar:', error.message); process.exit(1) }
    all = all.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

async function main() {
  console.log(`\n=== Gerar parcelas futuras${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`)

  const txs = await loadAllInstallments()
  console.log(`  ${txs.length} transações parceladas carregadas`)

  // Group by installment_group_id
  const byGroup = new Map()
  for (const tx of txs) {
    const gid = tx.installment_group_id
    if (!gid) continue
    if (!byGroup.has(gid)) byGroup.set(gid, [])
    byGroup.get(gid).push(tx)
  }
  console.log(`  ${byGroup.size} grupos de parcelamento\n`)

  const toInsert = []

  for (const [groupId, items] of byGroup) {
    const sorted = [...items].sort((a, b) => a.date.slice(0,10).localeCompare(b.date.slice(0,10)))
    const total = sorted[0].total_installments
    const recorded = sorted.length

    if (recorded >= total) continue  // grupo completo

    // Use last recorded installment as template
    const last = sorted[sorted.length - 1]
    const lastNum = last.installment_number ?? recorded

    // Only generate FUTURE installments (after last recorded date)
    const missing = total - lastNum
    if (missing <= 0) continue

    // Build base description (strip existing "X/Y" suffix if present)
    const descMatch = /^(.*?)\s+\d{1,2}\/\d{1,2}$/.exec(last.description?.trim() ?? '')
    const baseDesc = descMatch ? descMatch[1].trim() : last.description

    for (let i = 1; i <= missing; i++) {
      const num = lastNum + i
      const date = addMonths(last.date, i)
      const desc = `${baseDesc} ${num}/${total}`
      toInsert.push({
        owner_id:             OWNER_ID,
        description:          desc,
        amount:               last.amount,
        date,
        purchase_date:        null,
        category_id:          last.category_id,
        credit_card_id:       last.credit_card_id,
        credit_card_bill_id:  null,  // new bill will be assigned later
        account_id:           last.account_id,
        status:               'PROJECTED',
        installment_number:   num,
        total_installments:   total,
        installment_group_id: groupId,
        labels:               last.labels ?? [],
        position:             null,
      })
    }
  }

  // Summary
  const byYear = {}
  for (const t of toInsert) {
    const y = t.date.slice(0, 4)
    byYear[y] = (byYear[y] ?? 0) + 1
  }
  console.log(`  ${toInsert.length} parcelas a gerar:`)
  for (const [y, n] of Object.entries(byYear).sort()) console.log(`    ${y}: ${n}`)

  if (toInsert.length === 0) { console.log('\nNada a fazer.'); return }

  if (DRY_RUN) {
    console.log('\nAmostra (primeiras 10):')
    for (const t of toInsert.slice(0, 10))
      console.log(`  ${t.date}  ${t.description}  R$${t.amount}`)
    console.log('\n(dry-run: nenhuma escrita realizada)')
    return
  }

  // Insert in batches
  const BATCH = 200
  let done = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('transactions').insert(chunk)
    if (error) { console.error(`\nErro no batch ${i}:`, error.message); process.exit(1) }
    done += chunk.length
    process.stdout.write(`\r  Inserindo: ${done}/${toInsert.length}`)
  }
  console.log(' ✓\n')

  // Backfill credit_card_bills for the new transactions
  console.log('  Criando faturas para os novos registros...')
  const ccTxs = toInsert.filter(t => t.credit_card_id)
  const billKeys = new Map()
  for (const t of ccTxs) {
    const d = new Date(t.date + 'T12:00:00')
    const key = `${t.credit_card_id}-${d.getFullYear()}-${d.getMonth() + 1}`
    if (!billKeys.has(key)) billKeys.set(key, { owner_id: OWNER_ID, credit_card_id: t.credit_card_id, year: d.getFullYear(), month: d.getMonth() + 1, status: 'OPEN' })
  }
  if (billKeys.size > 0) {
    const { error } = await supabase.from('credit_card_bills')
      .upsert([...billKeys.values()], { onConflict: 'credit_card_id,year,month', ignoreDuplicates: true })
    if (error) console.warn('  Aviso ao criar faturas:', error.message)
    else console.log(`  ${billKeys.size} faturas criadas/verificadas ✓`)
  }

  console.log(`\n✅ ${toInsert.length} parcelas futuras geradas com sucesso!`)
}

main()
