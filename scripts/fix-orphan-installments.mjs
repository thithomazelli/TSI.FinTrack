/**
 * Finds installment transactions that have no installment_group_id but match
 * a description pattern "Base X/Y" where other transactions in the same series
 * already have a group ID. Links the orphans to the existing group.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> node scripts/fix-orphan-installments.mjs
 *   SUPABASE_SERVICE_KEY=<key> node scripts/fix-orphan-installments.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rknjcrcvsetspfvexjsu.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const OWNER_ID     = '69f852bc-af5a-4f11-b293-37bf2f809018'
const DRY_RUN      = process.argv.includes('--dry-run')

if (!SERVICE_KEY) { console.error('\nERRO: defina SUPABASE_SERVICE_KEY\n'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const INST_RE = /^(.*?)\s+(\d{1,2})\/(\d{1,2})$/

async function load() {
  const PAGE = 1000
  let all = [], offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, description, date, credit_card_id, account_id, installment_number, total_installments, installment_group_id')
      .eq('owner_id', OWNER_ID)
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
  console.log(`\n=== Fix orphan installments${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`)

  const all = await load()
  console.log(`  ${all.length} transações carregadas`)

  const instRe = INST_RE

  // Build two maps from transactions that already have a group ID:
  //   exact: (base, card, account, total)  — preferred
  //   loose: (base, total)                 — fallback when card differs
  const exactMap = new Map()
  const looseMap = new Map()
  for (const tx of all) {
    if (!tx.installment_group_id) continue
    const m = instRe.exec(tx.description?.trim() ?? '')
    if (!m) continue
    const base = m[1].trim().toLowerCase()
    const total = parseInt(m[3], 10)
    const exactKey = `${base}|${tx.credit_card_id ?? ''}|${tx.account_id ?? ''}|${total}`
    if (!exactMap.has(exactKey)) exactMap.set(exactKey, { groupId: tx.installment_group_id, total })
    const looseKey = `${base}|${total}`
    if (!looseMap.has(looseKey)) looseMap.set(looseKey, { groupId: tx.installment_group_id, total })
  }

  // Find orphans (no group ID) that match a known group — exact first, loose fallback
  const toFix = []
  for (const tx of all) {
    if (tx.installment_group_id) continue
    const m = instRe.exec(tx.description?.trim() ?? '')
    if (!m) continue
    const base = m[1].trim().toLowerCase()
    const num = parseInt(m[2], 10)
    const total = parseInt(m[3], 10)
    const exactKey = `${base}|${tx.credit_card_id ?? ''}|${tx.account_id ?? ''}|${total}`
    const looseKey = `${base}|${total}`
    const match = exactMap.get(exactKey) ?? looseMap.get(looseKey)
    if (match) {
      const matchType = exactMap.has(exactKey) ? '' : ' (loose match — cartão diferente)'
      toFix.push({ id: tx.id, description: tx.description, date: tx.date, num, total, groupId: match.groupId, matchType })
    }
  }

  if (toFix.length === 0) {
    console.log('\n  Nenhum órfão encontrado.')
    return
  }

  console.log(`\n  ${toFix.length} registro(s) órfão(s) encontrado(s):`)
  for (const t of toFix) {
    console.log(`    [${t.date}] ${t.description}  →  grupo ${t.groupId}${t.matchType}`)
  }

  if (DRY_RUN) {
    console.log('\n(dry-run: nenhuma escrita realizada)')
    return
  }

  for (const t of toFix) {
    const { error } = await supabase
      .from('transactions')
      .update({
        installment_group_id: t.groupId,
        installment_number: t.num,
        total_installments: t.total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', t.id)
      .eq('owner_id', OWNER_ID)
    if (error) { console.error(`  Erro ao atualizar ${t.id}:`, error.message); process.exit(1) }
    console.log(`  ✓ ${t.description}`)
  }

  console.log(`\n✅ ${toFix.length} registro(s) corrigido(s)!`)
}

main()
