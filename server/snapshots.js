// Coleta snapshots diarios do Meta Ads e salva no SQLite local.
// Roda via cron todo dia 4am + botao manual "Sincronizar" no dashboard + backfill script.

import {
  saveSnapshot, saveCreative, saveCampaignStructure, saveAdsetStructure,
  startRun, endRun,
} from './db.js'

const META_BASE = 'https://graph.facebook.com/v21.0'

const TIMEOUT_MS = 45000  // 45s por chamada Meta — se estourar, aborta e propaga erro
const ASYNC_POLL_TIMEOUT_MS = 300000  // 5 min max de polling do async job
const ASYNC_POLL_INTERVAL_MS = 3000   // poll a cada 3s

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), opts.timeout || TIMEOUT_MS)
  try {
    const resp = await fetch(url, { ...opts, signal: ctrl.signal })
    return resp
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Timeout ${(opts.timeout || TIMEOUT_MS)/1000}s`)
    throw e
  } finally {
    clearTimeout(t)
  }
}

async function metaFetch(path, params, token) {
  const url = new URL(`${META_BASE}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v)
  const resp = await fetchWithTimeout(url.toString())
  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || 'Meta API error')
  return data
}

/**
 * Async Insights Job — recomendado pela Meta pra queries pesadas (level=ad, ranges longos).
 * Cria job → poll ate completar → busca resultado paginado.
 * https://developers.facebook.com/docs/marketing-api/insights/best-practices/
 */
async function metaAsyncInsights(accountId, params, token, maxPages = 30) {
  // 1. Cria job — Meta EXIGE POST (nao GET)
  const createUrl = `${META_BASE}/${accountId}/insights`
  const body = new URLSearchParams()
  body.set('access_token', token)
  for (const [k, v] of Object.entries(params || {})) body.set(k, v)
  const createResp = await fetchWithTimeout(createUrl, {
    method: 'POST',
    body: body.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const createData = await createResp.json()
  if (createData.error) throw new Error('async create: ' + createData.error.message)
  const runId = createData.report_run_id
  if (!runId) throw new Error('async create: sem report_run_id na resposta')

  // 2. Poll ate completar
  const deadline = Date.now() + ASYNC_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, ASYNC_POLL_INTERVAL_MS))
    const statusUrl = `${META_BASE}/${runId}?access_token=${token}`
    const statusResp = await fetchWithTimeout(statusUrl)
    const status = await statusResp.json()
    if (status.error) throw new Error('async poll: ' + status.error.message)
    if (status.async_status === 'Job Completed') break
    if (status.async_status === 'Job Failed' || status.async_status === 'Job Skipped') {
      throw new Error('async job failed: ' + JSON.stringify(status))
    }
    // continua polling
  }

  // 3. Busca resultado paginado (usa metaFetchAll normal, sem access_token no path)
  const resultUrl = new URL(`${META_BASE}/${runId}/insights`)
  resultUrl.searchParams.set('access_token', token)
  resultUrl.searchParams.set('limit', '500')

  const all = []
  let url = resultUrl.toString()
  let pages = 0
  while (url && pages < maxPages) {
    const resp = await fetchWithTimeout(url)
    const data = await resp.json()
    if (data.error) throw new Error('async result: ' + data.error.message)
    if (data.data) all.push(...data.data)
    url = data.paging?.next || null
    pages++
  }
  return all
}

// Pagina automatica seguindo o cursor "next". Se paginas > maxPages, para.
async function metaFetchAll(path, params, token, maxPages = 20) {
  const all = []
  let firstUrl = new URL(`${META_BASE}${path}`)
  firstUrl.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params || {})) firstUrl.searchParams.set(k, v)

  let url = firstUrl.toString()
  let pages = 0
  while (url && pages < maxPages) {
    const resp = await fetchWithTimeout(url)
    const data = await resp.json()
    if (data.error) throw new Error(data.error.message || 'Meta API error')
    if (data.data) all.push(...data.data)
    url = data.paging?.next || null
    pages++
  }
  return all
}

function fmtDate(d) { return d.toISOString().split('T')[0] }

/**
 * Coleta snapshot de UM dia especifico pra UMA conta.
 * Salva insights nos 4 niveis (account/campaign/adset/ad) do dia.
 */
export async function snapshotDayForAccount(accountId, token, date) {
  return snapshotRangeForAccount(accountId, token, date, date)
}

/**
 * NOVO — puxa TODO o range num numero minimo de chamadas Meta usando time_increment=1.
 * Meta retorna 1 registro por dia por entidade, e a gente separa em snapshots diarios locais.
 * Reduz de 4*N chamadas (uma por dia+level) pra apenas 4 chamadas totais (1 por level).
 */
export async function snapshotRangeForAccount(accountId, token, since, until) {
  const insightsFields = 'spend,impressions,clicks,ctr,reach,frequency,actions,action_values'
  const timeRange = JSON.stringify({ since, until })
  const levels = ['account', 'campaign', 'adset', 'ad']

  // Calcula quantos dias — se > 14, level=ad usa async job (Meta recomenda)
  const daysDiff = Math.ceil((new Date(until) - new Date(since)) / 86400000) + 1
  const adUseAsync = daysDiff > 14

  const levelPromises = levels.map(level => {
    const fields = level === 'account' ? insightsFields
                 : level === 'campaign' ? `campaign_id,campaign_name,${insightsFields}`
                 : level === 'adset'    ? `campaign_id,campaign_name,adset_id,adset_name,${insightsFields}`
                                        : `campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,${insightsFields}`
    const params = {
      fields, time_range: timeRange, level,
      time_increment: '1',
      limit: '500',
    }
    // level=ad em range longo usa async job (evita timeout sync)
    if (level === 'ad' && adUseAsync) {
      return metaAsyncInsights(accountId, params, token, 60)
        .then(data => ({ level, data }))
    }
    return metaFetchAll(`/${accountId}/insights`, params, token, 30)
      .then(data => ({ level, data }))
  })

  const settled = await Promise.allSettled(levelPromises)
  const results = {}
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    const level = levels[i]
    if (r.status === 'rejected') {
      results[level] = { error: r.reason?.message || String(r.reason) }
      continue
    }
    const data = r.value.data
    const byDate = new Map()
    for (const row of data) {
      const d = row.date_start
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d).push(row)
    }
    for (const [d, rows] of byDate.entries()) {
      saveSnapshot(accountId, d, level, rows)
    }
    results[level] = {
      records: data.length,
      days: byDate.size,
      async: level === 'ad' && adUseAsync,
    }
  }
  return results
}

/**
 * Atualiza estrutura (campaigns + adsets) e cache de criativos.
 * OTIMIZADO: 3 chamadas totais por conta (nao mais 180 uma por campanha):
 *   1. /act_X/campaigns (todas)
 *   2. /act_X/adsets   (todos, com campaign_id incluso pra vincular)
 *   3. /act_X/ads      (todos, com creative aninhado)
 * As 3 chamadas rodam EM PARALELO com Promise.allSettled.
 * Filter status: nao processa ARCHIVED (economiza 30-70% do payload em contas antigas).
 */
export async function updateStructureAndCreatives(accountId, token) {
  const errors = []
  const notArchivedFilter = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE','PAUSED','ADSET_PAUSED','CAMPAIGN_PAUSED','WITH_ISSUES','PENDING_REVIEW','DISAPPROVED','IN_PROCESS'] }])

  const [campaignsRes, adsetsRes, adsRes] = await Promise.allSettled([
    metaFetchAll(`/${accountId}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
      filtering: notArchivedFilter,
      limit: '200',
    }, token, 10),
    metaFetchAll(`/${accountId}/adsets`, {
      fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget',
      filtering: notArchivedFilter,
      limit: '200',
    }, token, 15),
    metaFetchAll(`/${accountId}/ads`, {
      fields: 'id,name,effective_status,campaign_id,adset_id,creative{id,thumbnail_url,image_url,video_id,effective_object_story_id}',
      filtering: notArchivedFilter,
      limit: '100',
    }, token, 30),
  ])

  if (campaignsRes.status === 'fulfilled') {
    for (const c of campaignsRes.value) saveCampaignStructure(accountId, c)
  } else {
    errors.push(`campaigns: ${campaignsRes.reason?.message || campaignsRes.reason}`)
  }

  if (adsetsRes.status === 'fulfilled') {
    for (const a of adsetsRes.value) saveAdsetStructure(accountId, a.campaign_id || null, a)
  } else {
    errors.push(`adsets: ${adsetsRes.reason?.message || adsetsRes.reason}`)
  }

  if (adsRes.status === 'fulfilled') {
    for (const ad of adsRes.value) saveCreative(accountId, ad)
  } else {
    errors.push(`ads: ${adsRes.reason?.message || adsRes.reason}`)
  }

  return errors
}

/**
 * Rotina completa: puxa dias faltantes ate D-1 pra 1 conta.
 * daysBack: quantos dias pra tras verificar (backfill inicial usa 90, cron diario usa 2).
 */
export async function syncAccount(accountId, token, daysBack = 2) {
  const today = new Date()
  const end = new Date(today); end.setDate(end.getDate() - 1)  // ontem
  const start = new Date(end); start.setDate(start.getDate() - daysBack + 1)
  const errors = []

  // 1 chamada por level (4 total) puxa TODO o range de daysBack dias
  let ok = 0
  try {
    const results = await snapshotRangeForAccount(accountId, token, fmtDate(start), fmtDate(end))
    for (const [level, r] of Object.entries(results)) {
      if (r.error) errors.push(`${level}: ${r.error}`)
      else ok += r.days || 0
    }
  } catch (e) {
    errors.push(`range: ${e.message}`)
  }

  // Atualiza estrutura (nao eh diario, so uma vez por sync)
  const structErrors = await updateStructureAndCreatives(accountId, token)
  errors.push(...structErrors)

  return { ok, errors }
}

/**
 * Sync geral: pega lista de contas Meta e roda syncAccount pra cada uma.
 * accounts = [{id, name}], token = access_token Meta
 */
export async function syncAllAccounts(accounts, token, daysBack = 2) {
  const runId = startRun(accounts.length)
  let ok = 0, err = 0
  const errorLog = []

  for (const acc of accounts) {
    try {
      const result = await syncAccount(acc.id, token, daysBack)
      if (result.errors.length > 0) errorLog.push(`${acc.name} (${acc.id}): ${result.errors.join('; ').substring(0, 300)}`)
      ok++
    } catch (e) {
      err++
      errorLog.push(`${acc.name} (${acc.id}): FATAL ${e.message}`)
    }
  }

  endRun(runId, ok, err, errorLog.join('\n').substring(0, 4000))
  return { ok, err, errorLog }
}
