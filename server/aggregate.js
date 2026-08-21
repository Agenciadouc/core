// Le snapshots do SQLite e agrega ao formato que o Meta API retornaria.
// Assim os endpoints /cached/* respondem exatamente como os /meta/* originais.

import {
  getSnapshotsInRange, getCachedCampaigns, getCachedAdsets,
  getCreativesByAccount, getCreativesByAdset, getAccountLatestUpdate,
} from './db.js'

// Soma actions[] de N objetos por action_type
function sumActions(arrays) {
  const map = new Map()
  for (const arr of arrays) {
    if (!arr) continue
    for (const a of arr) {
      const prev = map.get(a.action_type) || 0
      map.set(a.action_type, prev + parseFloat(a.value || 0))
    }
  }
  return Array.from(map.entries()).map(([action_type, value]) => ({ action_type, value: String(value) }))
}

// Agrega N insights do mesmo grupo (mesmo campaign_id, ou tudo se for account level)
function aggregateInsights(rows, groupBy = null) {
  if (!rows.length) return []

  const groups = new Map()
  for (const r of rows) {
    const key = groupBy ? r[groupBy] || '__none' : '__all'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  const results = []
  for (const [key, list] of groups.entries()) {
    const spend = list.reduce((s, r) => s + parseFloat(r.spend || 0), 0)
    const impressions = list.reduce((s, r) => s + parseInt(r.impressions || 0), 0)
    const clicks = list.reduce((s, r) => s + parseInt(r.clicks || 0), 0)
    const reach = list.reduce((s, r) => s + parseInt(r.reach || 0), 0)
    const first = list[0]

    const out = {
      spend: String(spend.toFixed(2)),
      impressions: String(impressions),
      clicks: String(clicks),
      reach: String(reach),
      ctr: impressions > 0 ? String((clicks / impressions * 100).toFixed(4)) : '0',
      cpc: clicks > 0 ? String((spend / clicks).toFixed(4)) : '0',
      cpm: impressions > 0 ? String((spend / impressions * 1000).toFixed(4)) : '0',
      frequency: reach > 0 ? String((impressions / reach).toFixed(4)) : '0',
      actions: sumActions(list.map(r => r.actions)),
      action_values: sumActions(list.map(r => r.action_values)),
      cost_per_action_type: sumActions(list.map(r => r.cost_per_action_type)),
      date_start: list[list.length - 1].date_start,
      date_stop: list[0].date_stop,
    }

    // Copia identifiers do primeiro (campaign_name, adset_name, etc)
    for (const k of ['campaign_id','campaign_name','adset_id','adset_name','ad_id','ad_name']) {
      if (first[k]) out[k] = first[k]
    }

    results.push(out)
  }

  return results
}

// Flat: pega snapshots do range e concatena todos os data[] em um array so
function flatSnapshots(accountId, level, since, until) {
  const snaps = getSnapshotsInRange(accountId, level, since, until)
  return snaps.flatMap(s => s.data)
}

// ============ AGGREGATE por nivel ============

export function getAccountInsights(accountId, since, until) {
  const rows = flatSnapshots(accountId, 'account', since, until)
  return aggregateInsights(rows)
}

export function getCampaignInsights(accountId, since, until) {
  const rows = flatSnapshots(accountId, 'campaign', since, until)
  return aggregateInsights(rows, 'campaign_id')
}

export function getAdsetInsightsByCampaign(accountId, campaignId, since, until) {
  const rows = flatSnapshots(accountId, 'adset', since, until).filter(r => r.campaign_id === campaignId)
  return aggregateInsights(rows, 'adset_id')
}

export function getAdInsightsByAdset(accountId, adsetId, since, until) {
  const rows = flatSnapshots(accountId, 'ad', since, until).filter(r => r.adset_id === adsetId)
  return aggregateInsights(rows, 'ad_id')
}

export function getAllAdInsights(accountId, since, until) {
  const rows = flatSnapshots(accountId, 'ad', since, until)
  return aggregateInsights(rows, 'ad_id')
}

// Daily: retorna um insight por dia (nao agrega across dias)
export function getDailyAccountInsights(accountId, since, until) {
  const snaps = getSnapshotsInRange(accountId, 'account', since, until)
  return snaps.flatMap(s => s.data.map(d => ({ ...d, date_start: s.date, date_stop: s.date })))
}

// ============ ESTRUTURA + CRIATIVOS (do cache) ============

export function getCampaigns(accountId) {
  return getCachedCampaigns(accountId)
}

export function getAdsets(accountId, campaignId) {
  return getCachedAdsets(accountId, campaignId)
}

export function getAdsWithCreatives(accountId, adsetId) {
  return getCreativesByAdset(accountId, adsetId)
}

export function getAllAdsWithCreatives(accountId) {
  return getCreativesByAccount(accountId)
}

// ============ META INFO ============

export function getAccountLastSync(accountId) {
  return getAccountLatestUpdate(accountId)
}
