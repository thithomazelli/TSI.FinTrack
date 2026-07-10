/**
 * Backfill installment fields on existing transactions.
 *
 * Detects descriptions like "Descrição X/Y" where X = installment number
 * and Y = total installments, then groups them and writes:
 *   installment_number, total_installments, installment_group_id
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> node scripts/backfill-installments.mjs
 *   SUPABASE_SERVICE_KEY=<key> node scripts/backfill-installments.mjs --dry-run
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

// "Alguma Descrição 3/12" → { base: 'Alguma Descrição', num: 3, total: 12 }
const INSTALLMENT_RE = /^(.*?)\s+(\d{1,2})\/(\d{1,2})$/

function parseDesc(description) {
  const m = INSTALLMENT_RE.exec(description?.trim() ?? '')
  if (!m) return null
  const num   = parseInt(m[2], 10)
  const total = parseInt(m[3], 10)
  if (num < 1 || total < 2 || num > total) return null
  return { base: m[1].trim(), num, total }
}

async function loadAllTransactions() {
  const PAGE = 1000
  let all = [], offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, description, date, amount, credit_card_id, installment_group_id')
      .eq('owner_id', OWNER_ID)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('Erro ao carregar transações:', error.message); process.exit(1) }
    all = all.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

async function main() {
  console.log(`\n=== Backfill de parcelas${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`)

  const txs = await loadAllTransactions()
  console.log(`  ${txs.length} transações carregadas`)

  // Separate installment candidates from already-tagged
  const candidates = txs.filter(t => !t.installment_group_id && parseDesc(t.description))
  const alreadyTagged = txs.filter(t => t.installment_group_id).length
  console.log(`  ${alreadyTagged} já têm installment_group_id — pulando`)
  console.log(`  ${candidates.length} candidatos com padrão X/Y na descrição\n`)

  // Group by (base_description, credit_card_id, total_installments)
  // Within each bucket, sort by date and slice into groups of `total` items
  const buckets = new Map()
  for (const tx of candidates) {
    const parsed = parseDesc(tx.description)
    const key = `${parsed.base.toLowerCase()}|${tx.credit_card_id ?? 'null'}|${parsed.total}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push({ tx, parsed })
  }

  const updates = [] // { id, installment_number, total_installments, installment_group_id }
  let groupCount = 0

  for (const [key, items] of buckets) {
    // Sort by date then by installment number to keep order consistent
    items.sort((a, b) => {
      const dd = a.tx.date.localeCompare(b.tx.date)
      return dd !== 0 ? dd : a.parsed.num - b.parsed.num
    })

    const total = items[0].parsed.total

    // Split into sub-groups of exactly `total` items (handles repeated purchases)
    for (let i = 0; i < items.length; i += total) {
      const chunk = items.slice(i, i + total)
      if (chunk.length < 2) continue // single item — skip
      const groupId = randomUUID()
      groupCount++
      for (const { tx, parsed } of chunk) {
        updates.push({
          id: tx.id,
          installment_number: parsed.num,
          total_installments: parsed.total,
          installment_group_id: groupId,
        })
      }
    }
  }

  console.log(`  ${groupCount} grupos detectados → ${updates.length} transações para atualizar\n`)

  if (updates.length === 0) {
    console.log('Nada a fazer.')
    return
  }

  if (DRY_RUN) {
    console.log('Amostra (primeiros 10 updates):')
    for (const u of updates.slice(0, 10)) console.log(' ', u)
    console.log('\n(dry-run: nenhuma escrita realizada)')
    return
  }

  // Batch updates — Supabase doesn't support bulk update by id list elegantly,
  // so we send individual updates in parallel batches.
  const CONCURRENCY = 20
  let done = 0
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY)
    await Promise.all(chunk.map(u =>
      supabase.from('transactions').update({
        installment_number:   u.installment_number,
        total_installments:   u.total_installments,
        installment_group_id: u.installment_group_id,
        updated_at: new Date().toISOString(),
      }).eq('id', u.id).eq('owner_id', OWNER_ID)
    ))
    done += chunk.length
    process.stdout.write(`\r  Atualizando: ${done}/${updates.length}`)
  }
  console.log(' ✓\n')
  console.log(`✅ ${updates.length} transações atualizadas em ${groupCount} grupos de parcelas.`)
}

main()
