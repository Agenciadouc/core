// Backfill de snapshots Meta pra todas as contas.
// Uso: node scripts/backfill-meta.js [dias]  (default 90)
// Requer .env na raiz do projeto ou variaveis META_ACCESS_TOKEN definidas.

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { snapshotDayForAccount, updateStructureAndCreatives } from '../server/snapshots.js'
import { startRun, endRun } from '../server/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

// Polyfill fetch pra Node 16
if (!globalThis.fetch) {
  const mod = await import('node-fetch')
  globalThis.fetch = mod.default
}

// Prioridade pro token: Hub (fonte da verdade em runtime) > .env local (fallback)
// Isso alinha com o Core que faz syncFromHub e sobrescreve META_TOKEN na memoria.
async function resolveToken() {
  const HUB_URL = process.env.HUB_URL || 'http://localhost:3003'
  const SECRET = process.env.CORE_EMBED_SECRET || 'dros-core-embed-2026-shared-key'
  try {
    const resp = await fetch(`${HUB_URL}/api/config/tokens`, { headers: { 'X-Core-Secret': SECRET } })
    if (resp.ok) {
      const { tokens } = await resp.json()
      if (tokens?.META_ACCESS_TOKEN) {
        console.log('Token pego do Hub (source of truth em runtime)')
        return tokens.META_ACCESS_TOKEN
      }
    }
    console.log(`Aviso: Hub em ${HUB_URL} nao retornou token — caindo no .env local`)
  } catch (e) {
    console.log(`Aviso: nao conectou no Hub (${e.message}) — caindo no .env local`)
  }
  return process.env.META_ACCESS_TOKEN
}

const META_TOKEN = await resolveToken()
if (!META_TOKEN) {
  console.error('ERRO: nenhum token META encontrado (nem no Hub nem no .env)')
  process.exit(1)
}

const daysBack = parseInt(process.argv[2] || '90')
console.log(`\n=== BACKFILL META ADS — ${daysBack} dias ===\n`)

function fmtDate(d) { return d.toISOString().split('T')[0] }

async function main() {
  // Lista contas
  console.log('Buscando contas Meta...')
  let accounts = []
  let url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=200&access_token=${META_TOKEN}`
  while (url) {
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.error) { console.error('Erro Meta:', data.error.message); process.exit(1) }
    accounts.push(...(data.data || []))
    url = data.paging?.next || null
  }
  console.log(`Encontradas ${accounts.length} contas\n`)

  const runId = startRun(accounts.length)
  let okAccounts = 0, errAccounts = 0
  const errorLog = []

  for (let ai = 0; ai < accounts.length; ai++) {
    const acc = accounts[ai]
    console.log(`\n[${ai + 1}/${accounts.length}] ${acc.name} (${acc.id})`)

    // Atualiza estrutura (campanhas/adsets/criativos) 1x por conta
    try {
      const structErrs = await updateStructureAndCreatives(acc.id, META_TOKEN)
      if (structErrs.length) console.log(`  aviso estrutura: ${structErrs.length} avisos`)
    } catch (e) {
      console.log(`  erro estrutura: ${e.message}`)
      errorLog.push(`${acc.name}: estrutura ${e.message}`)
    }

    // Snapshots dia a dia
    let dayOk = 0, dayErr = 0
    const today = new Date()
    for (let i = daysBack; i >= 1; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const date = fmtDate(d)
      try {
        await snapshotDayForAccount(acc.id, META_TOKEN, date)
        dayOk++
        process.stdout.write('.')
      } catch (e) {
        dayErr++
        process.stdout.write('x')
        errorLog.push(`${acc.name} ${date}: ${e.message}`.substring(0, 200))
      }
    }
    console.log(`\n  ${dayOk} dias ok, ${dayErr} falhas`)

    if (dayErr < daysBack / 2) okAccounts++
    else errAccounts++
  }

  endRun(runId, okAccounts, errAccounts, errorLog.join('\n').substring(0, 4000))
  console.log(`\n=== CONCLUIDO — contas ok=${okAccounts} err=${errAccounts} ===`)
  process.exit(0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
