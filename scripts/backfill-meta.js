// Backfill de snapshots Meta pra todas as contas.
// Uso: node scripts/backfill-meta.js [dias]  (default 90)
// Requer .env na raiz do projeto ou variaveis META_ACCESS_TOKEN definidas.

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { snapshotRangeForAccount, updateStructureAndCreatives } from '../server/snapshots.js'
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

async function fetchHubClients() {
  const HUB_URL = process.env.HUB_URL || 'http://localhost:3003'
  const SECRET = process.env.CORE_EMBED_SECRET || 'dros-core-embed-2026-shared-key'
  try {
    const resp = await fetch(`${HUB_URL}/api/config/clients`, { headers: { 'X-Core-Secret': SECRET } })
    if (!resp.ok) return []
    const { clients } = await resp.json()
    return clients || []
  } catch (e) {
    console.log(`Aviso: nao conseguiu contas do Hub (${e.message}) — vai processar TODAS`)
    return []
  }
}

async function main() {
  // Puxa contas configuradas no Hub — foco em quem realmente vai aparecer no dashboard
  console.log('Buscando contas configuradas no Hub...')
  const hubClients = await fetchHubClients()
  const hubAccountIds = new Set(
    hubClients
      .map(c => (c.core_meta_account_id || '').trim())
      .filter(Boolean)
      .map(id => id.startsWith('act_') ? id : `act_${id}`)
  )
  console.log(`Hub tem ${hubAccountIds.size} clientes com Meta configurado`)

  // Lista TODAS as contas Meta (pra filtrar depois)
  console.log('Listando adaccounts Meta pra filtrar...')
  let allAccounts = []
  let url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=200&access_token=${META_TOKEN}`
  while (url) {
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.error) { console.error('Erro Meta:', data.error.message); process.exit(1) }
    allAccounts.push(...(data.data || []))
    url = data.paging?.next || null
  }

  // Filtra: se Hub tem lista, usa so ela. Se Hub retornou vazio, processa todas.
  let accounts
  if (hubAccountIds.size > 0) {
    accounts = allAccounts.filter(a => hubAccountIds.has(a.id))
    console.log(`Filtradas ${accounts.length} contas (de ${allAccounts.length}) que estao no Hub\n`)
  } else {
    accounts = allAccounts
    console.log(`Sem filtro Hub — processando todas as ${accounts.length} contas\n`)
  }

  if (accounts.length === 0) {
    console.log('Nenhuma conta pra processar. Verifica core_meta_account_id dos clientes no Hub.')
    process.exit(0)
  }

  const runId = startRun(accounts.length)
  let okAccounts = 0, errAccounts = 0
  const errorLog = []

  // Processa 2 contas em paralelo (async job + estrutura em paralelo = 8 chamadas simultaneas)
  // Rate limit ads_insights standard: 190k + 400*active_ads por hora. 2x contas = confortavel.
  const CONCURRENCY = 2
  const today = new Date()
  const end = new Date(today); end.setDate(end.getDate() - 1)
  const start = new Date(end); start.setDate(start.getDate() - daysBack + 1)
  const sinceStr = fmtDate(start), untilStr = fmtDate(end)

  async function processAccount(acc, index) {
    const t0 = Date.now()
    const prefix = `[${index + 1}/${accounts.length}] ${acc.name.substring(0, 30)}`

    // Estrutura + snapshots em paralelo
    const [structResult, snapResult] = await Promise.allSettled([
      updateStructureAndCreatives(acc.id, META_TOKEN),
      snapshotRangeForAccount(acc.id, META_TOKEN, sinceStr, untilStr),
    ])

    const parts = []
    let hasError = false

    if (structResult.status === 'fulfilled') {
      const errs = structResult.value
      parts.push(`estrut:${errs.length ? `${errs.length}av` : 'ok'}`)
      if (errs.length) errorLog.push(`${acc.name} struct: ${errs[0]}`)
    } else {
      parts.push('estrut:ERR')
      hasError = true
      errorLog.push(`${acc.name} struct: ${structResult.reason?.message || structResult.reason}`)
    }

    if (snapResult.status === 'fulfilled') {
      let totalDays = 0, totalRecs = 0
      const failedLevels = []
      for (const [level, r] of Object.entries(snapResult.value)) {
        if (r.error) {
          parts.push(`${level[0]}!`)
          failedLevels.push(`${level}: ${r.error.substring(0, 150)}`)
          errorLog.push(`${acc.name} ${level}: ${r.error}`.substring(0, 200))
        } else {
          totalDays = Math.max(totalDays, r.days || 0)
          totalRecs += r.records || 0
        }
      }
      parts.push(`${totalDays}d/${totalRecs}reg`)
      // conta como erro so se TODOS os levels falharam. Se so o ad falhou, ainda vale.
      if (failedLevels.length === 4) hasError = true
    } else {
      parts.push('snap:ERR')
      hasError = true
      errorLog.push(`${acc.name} snap: ${snapResult.reason?.message || snapResult.reason}`)
    }

    const elapsed = Math.round((Date.now() - t0) / 1000)
    console.log(`${prefix.padEnd(45)} ${parts.join(' ')} ${elapsed}s`)
    return !hasError
  }

  // Rodar em batches de CONCURRENCY paralelas
  for (let i = 0; i < accounts.length; i += CONCURRENCY) {
    const batch = accounts.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((acc, j) => processAccount(acc, i + j)))
    for (const ok of results) { if (ok) okAccounts++; else errAccounts++ }
  }

  endRun(runId, okAccounts, errAccounts, errorLog.join('\n').substring(0, 4000))
  console.log(`\n=== CONCLUIDO — contas ok=${okAccounts} err=${errAccounts} ===`)
  if (errorLog.length > 0) {
    console.log(`\n=== ERROS DETALHADOS (${errorLog.length}) ===`)
    for (const e of errorLog.slice(0, 30)) console.log('  ' + e)
    if (errorLog.length > 30) console.log(`  ... e mais ${errorLog.length - 30}`)
  }
  process.exit(0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
