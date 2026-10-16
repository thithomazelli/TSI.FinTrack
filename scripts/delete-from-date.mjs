/**
 * Apaga os lançamentos da tela Movimentos a partir de uma data (inclusive):
 *   - entries            (date >= FROM)
 *   - transactions       (date >= FROM)
 *   - savings_movements  (date >= FROM)   — só com --include-savings
 *
 * NÃO apaga cadastros nem outras telas (contas, cartões, faturas, categorias, recorrentes, metas).
 *
 * Antes de apagar, salva TODAS as linhas afetadas em backups/<timestamp>-delete-from-<FROM>.json.
 * Esse arquivo pode ser restaurado com --restore.
 *
 * Uso:
 *   SUPABASE_SERVICE_KEY=<key> node scripts/delete-from-date.mjs                       # simulação (padrão)
 *   SUPABASE_SERVICE_KEY=<key> node scripts/delete-from-date.mjs --execute             # apaga de verdade
 *   SUPABASE_SERVICE_KEY=<key> node scripts/delete-from-date.mjs --from 2026-01-01 --include-savings --execute
 *   SUPABASE_SERVICE_KEY=<key> node scripts/delete-from-date.mjs --restore backups/<arquivo>.json
 */

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://rknjcrcvsetspfvexjsu.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const OWNER_ID     = process.env.OWNER_ID ?? '69f852bc-af5a-4f11-b293-37bf2f809018'

const args            = process.argv.slice(2)
const argValue        = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const FROM            = argValue('--from') ?? '2026-01-01'
const EXECUTE         = args.includes('--execute')
const INCLUDE_SAVINGS = args.includes('--include-savings')
const RESTORE_FILE    = argValue('--restore')

const PAGE  = 1000  // max_rows do PostgREST
const BATCH = 200

if (!SERVICE_KEY) {
  console.error('\nERRO: defina SUPABASE_SERVICE_KEY\n')
  process.exit(1)
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM)) {
  console.error(`\nERRO: --from inválido (${FROM}). Use AAAA-MM-DD.\n`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchFrom(table) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table).select('*')
      .eq('owner_id', OWNER_ID)
      .gte('date', FROM)
      .order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} (select): ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

async function deleteIds(table, ids) {
  let total = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error, count } = await supabase
      .from(table).delete({ count: 'exact' })
      .eq('owner_id', OWNER_ID)
      .in('id', ids.slice(i, i + BATCH))
    if (error) throw new Error(`${table} (delete): ${error.message}`)
    total += count ?? 0
  }
  return total
}

async function upsertRows(table, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH), { onConflict: 'id' })
    if (error) throw new Error(`${table} (upsert): ${error.message}`)
  }
  return rows.length
}

function summarize(table, rows) {
  if (rows.length === 0) return console.log(`  ${table.padEnd(18)}      0`)
  const dates = rows.map(r => r.date).sort()
  console.log(`  ${table.padEnd(18)} ${String(rows.length).padStart(6)}   (${dates[0]} → ${dates[dates.length - 1]})`)
}

// ── Restore ───────────────────────────────────────────────────────────────────

async function restore(file) {
  const backup = JSON.parse(readFileSync(file, 'utf8'))
  console.log(`\nRestaurando ${file} (gerado em ${backup.created_at}, from=${backup.from})\n`)
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (rows.length === 0) continue
    console.log(`  ${table.padEnd(18)} ${await upsertRows(table, rows)} restaurado(s)`)
  }
  console.log('\nRestauração concluída.\n')
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${EXECUTE ? '⚠️  EXECUTANDO' : 'SIMULAÇÃO (nada será apagado)'} — owner ${OWNER_ID}, a partir de ${FROM}\n`)

  const tables = ['entries', 'transactions', ...(INCLUDE_SAVINGS ? ['savings_movements'] : [])]
  const data = {}
  for (const t of tables) {
    data[t] = await fetchFrom(t)
    summarize(t, data[t])
  }
  if (!INCLUDE_SAVINGS) console.log(`  ${'savings_movements'.padEnd(18)} (mantido — use --include-savings para incluir)`)

  const total = Object.values(data).reduce((s, rows) => s + rows.length, 0)
  if (total === 0) return console.log('\nNada para apagar.\n')

  if (!EXECUTE) {
    console.log('\nSimulação concluída. Rode com --execute para apagar (um backup será salvo antes).\n')
    return
  }

  // Backup antes de qualquer delete
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = join(ROOT, 'backups')
  mkdirSync(backupDir, { recursive: true })
  const backupFile = join(backupDir, `${stamp}-delete-from-${FROM}.json`)
  writeFileSync(backupFile, JSON.stringify({
    created_at: new Date().toISOString(),
    owner_id: OWNER_ID,
    from: FROM,
    tables: data,
  }, null, 2))
  console.log(`\nBackup salvo em ${backupFile}\n`)

  for (const t of tables) {
    console.log(`  ${t.padEnd(18)} ${await deleteIds(t, data[t].map(r => r.id))} apagado(s)`)
  }

  console.log(`\nConcluído. Para desfazer: node scripts/delete-from-date.mjs --restore "${backupFile}"\n`)
}

(RESTORE_FILE ? restore(RESTORE_FILE) : main()).catch(err => {
  console.error('\nERRO:', err.message ?? err)
  process.exit(1)
})
