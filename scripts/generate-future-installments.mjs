/**
 * Para cada grupo de parcelamento que possui uma parcela em Dez/2026,
 * gera as parcelas restantes além de Dez/2026 (status PROJECTED).
 *
 * Uso:
 *   SUPABASE_SERVICE_KEY=<key> node scripts/generate-future-installments.mjs
 *   SUPABASE_SERVICE_KEY=<key> node scripts/generate-future-installments.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rknjcrcvsetspfvexjsu.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const OWNER_ID     = '69f852bc-af5a-4f11-b293-37bf2f809018'
const DRY_RUN      = process.argv.includes('--dry-run')

const ANCHOR_YEAR  = 2026
const ANCHOR_MONTH = 12  // Dezembro

if (!SERVICE_KEY) {
  console.error('\nERRO: defina SUPABASE_SERVICE_KEY\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function addMonths(dateStr, months) {
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00')
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
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
      .select('id, description, date, amount, category_id, credit_card_id, account_id, installment_number, total_installments, installment_group_id, labels')
      .eq('owner_id', OWNER_ID)
      .gt('total_installments', 1)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('Erro:', error.message); process.exit(1) }
    all = all.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

async function main() {
  console.log(`\n=== Parcelas futuras a partir de Dez/${ANCHOR_YEAR}${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`)

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
  console.log(`  ${byGroup.size} grupos encontrados\n`)

  const anchorStart = `${ANCHOR_YEAR}-${String(ANCHOR_MONTH).padStart(2,'0')}-01`
  const anchorEnd   = new Date(ANCHOR_YEAR, ANCHOR_MONTH, 0).toISOString().slice(0,10)

  const toInsert = []

  for (const [groupId, items] of byGroup) {
    const sorted = [...items].sort((a, b) => a.date.slice(0,10).localeCompare(b.date.slice(0,10)))
    const total = sorted[0].total_installments

    // Only process groups that have a transaction in the anchor month
    const hasAnchor = sorted.some(t => t.date.slice(0,10) >= anchorStart && t.date.slice(0,10) <= anchorEnd)
    if (!hasAnchor) continue

    // Last recorded installment
    const last = sorted[sorted.length - 1]
    const lastNum = last.installment_number ?? sorted.length
    const missing = total - lastNum

    if (missing <= 0) continue  // already complete

    const descMatch = /^(.*?)\s+\d{1,2}\/\d{1,2}$/.exec(last.description?.trim() ?? '')
    const baseDesc = descMatch ? descMatch[1].trim() : last.description

    console.log(`  ${baseDesc} — parcelas ${lastNum+1}→${total} (${missing} a gerar, última registrada: ${last.date.slice(0,10)})`)

    for (let i = 1; i <= missing; i++) {
      toInsert.push({
        owner_id:             OWNER_ID,
        description:          `${baseDesc} ${lastNum + i}/${total}`,
        amount:               last.amount,
        date:                 addMonths(last.date, i),
        purchase_date:        null,
        category_id:          last.category_id,
        credit_card_id:       last.credit_card_id,
        credit_card_bill_id:  null,
        account_id:           last.account_id,
        status:               'PROJECTED',
        installment_number:   lastNum + i,
        total_installments:   total,
        installment_group_id: groupId,
        labels:               last.labels ?? [],
        position:             null,
      })
    }
  }

  if (toInsert.length === 0) { console.log('\nNenhuma parcela futura a gerar.'); return }

  const byYear = {}
  for (const t of toInsert) { const y = t.date.slice(0,4); byYear[y] = (byYear[y]??0)+1 }
  console.log(`\n  Total: ${toInsert.length} parcelas a inserir`)
  for (const [y, n] of Object.entries(byYear).sort()) console.log(`    ${y}: ${n}`)

  if (DRY_RUN) {
    console.log('\n(dry-run: nenhuma escrita realizada)')
    return
  }

  const BATCH = 200
  let done = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const { error } = await supabase.from('transactions').insert(toInsert.slice(i, i + BATCH))
    if (error) { console.error(`\nErro:`, error.message); process.exit(1) }
    done += Math.min(BATCH, toInsert.length - i)
    process.stdout.write(`\r  Inserindo: ${done}/${toInsert.length}`)
  }
  console.log(' ✓')

  // Criar faturas para os novos registros de cartão
  const ccTxs = toInsert.filter(t => t.credit_card_id)
  if (ccTxs.length > 0) {
    const bills = new Map()
    for (const t of ccTxs) {
      const d = new Date(t.date + 'T12:00:00')
      const key = `${t.credit_card_id}-${d.getFullYear()}-${d.getMonth()+1}`
      bills.set(key, { owner_id: OWNER_ID, credit_card_id: t.credit_card_id, year: d.getFullYear(), month: d.getMonth()+1, status: 'OPEN' })
    }
    const { error } = await supabase.from('credit_card_bills')
      .upsert([...bills.values()], { onConflict: 'credit_card_id,year,month', ignoreDuplicates: true })
    if (error) console.warn('  Aviso faturas:', error.message)
    else console.log(`  ${bills.size} faturas criadas/verificadas ✓`)
  }

  console.log(`\n✅ ${toInsert.length} parcelas futuras geradas!`)
}

main()
