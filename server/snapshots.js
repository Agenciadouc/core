// Coleta snapshots diarios do Meta Ads e salva no SQLite local.
// Roda via cron todo dia 4am + botao manual "Sincronizar" no dashboard + backfill script.

import {
  saveSnapshot, saveCreative, saveCampaignStructure, saveAdsetStructure,
  startRun, endRun,
} from './db.js'

const META_BASE = 'https://graph.facebook.com/v21.0'

const TIMEOUT_MS = 45000  // 45s por chamada Meta — se estourar, aborta e propaga erro

async function fetchWithTimeout(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(url, { signal: ctrl.signal })
    return resp
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Timeout ${TIMEOUT_MS/1000}s`)
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
  const insightsFields = 'spend,impressions,clicks,ctr,reach,frequency,actions,action_values'
  const timeRange = JSON.stringify({ since: date, until: date })

  const results = {}
  for (const level of ['account', 'campaign', 'adset', 'ad']) {
    const fields = level === 'account' ? insightsFields
                 : level === 'campaign' ? `campaign_id,campaign_name,${insightsFields}`
                 : level === 'adset'    ? `campaign_id,campaign_name,adset_id,adset_name,${insightsFields}`
                                        : `campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,${insightsFields}`
    try {
      const data = await metaFetchAll(`/${accountId}/insights`, {
        fields, time_range: timeRange, level, limit: '200',
      }, token, 15)
      saveSnapshot(accountId, date, level, data)
      results[level] = data.length
    } catch (err) {
      results[level] = { error: err.message }
    }
  }
  return results
}

/**
 * Atualiza estrutura (campaigns + adsets) e cache de criativos.
 * Roda 1x por conta por dia, junto com o snapshot do dia anterior.
 */
export async function updateStructureAndCreatives(accountId, token) {
  const errors = []

  // Campanhas
  try {
    const campaigns = await metaFetchAll(`/${accountId}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
      limit: '200',
    }, token)
    for (const c of campaigns) saveCampaignStructure(accountId, c)

    // Adsets de cada campanha
    for (const c of campaigns) {
      try {
        const adsets = await metaFetchAll(`/${c.id}/adsets`, {
          fields: 'id,name,status,effective_status,daily_budget,lifetime_budget',
          limit: '200',
        }, token)
        for (const a of adsets) saveAdsetStructure(accountId, c.id, a)
      } catch (e) {
        errors.push(`adsets ${c.id}: ${e.message}`)
      }
    }
  } catch (e) {
    errors.push(`campaigns: ${e.message}`)
  }

  // Ads com creative (thumbnail) — campos minimos pra ficar leve
  try {
    const ads = await metaFetchAll(`/${accountId}/ads`, {
      fields: 'id,name,effective_status,campaign_id,adset_id,creative{id,thumbnail_url,image_url,video_id,effective_object_story_id}',
      limit: '50',   // paginas menores = respostas mais rapidas por request
    }, token, 30)   // ate 30 paginas = 1500 ads maximos por conta
    for (const ad of ads) saveCreative(accountId, ad)
  } catch (e) {
    errors.push(`ads: ${e.message}`)
  }

  return errors
}

/**
 * Rotina completa: puxa dias faltantes ate D-1 pra 1 conta.
 * daysBack: quantos dias pra tras verificar (backfill inicial usa 90, cron diario usa 2).
 */
export async function syncAccount(accountId, token, daysBack = 2) {
  const today = new Date()
  const errors = []
  let ok = 0

  // Puxa dias D-daysBack ate D-1 (ontem inclusive, hoje NAO)
  for (let i = daysBack; i >= 1; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const date = fmtDate(d)
    try {
      await snapshotDayForAccount(accountId, token, date)
      ok++
    } catch (e) {
      errors.push(`${date}: ${e.message}`)
    }
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
