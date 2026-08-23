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
  const insights = aggregateInsights(rows, 'campaign_id')
  // Enriquece com effective_status do structure cache (pra badge ATIVA/PAUSADA)
  const structure = getCachedCampaigns(accountId)
  const statusMap = new Map(structure.map(c => [c.id, c.effective_status]))
  for (const ins of insights) {
    if (ins.campaign_id && statusMap.has(ins.campaign_id)) {
      ins.effective_status = statusMap.get(ins.campaign_id)
    }
  }
  return insights
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

// ============ ESTRUTURA + CRIATIVOS (do cache, com fallback aos snapshots) ============

// Extrai entidades unicas dos snapshots quando structure_cache/creatives_cache tao vazios
// (evita mostrar "Sem conjuntos" quando ha dados de insights mas nao rodou updateStructure)
function uniqueFromSnapshots(accountId, level, groupField, nameField, parentFields = {}) {
  const rows = flatSnapshots(accountId, level, '2020-01-01', '2099-12-31')
  const map = new Map()
  for (const r of rows) {
    const id = r[groupField]
    if (!id) continue
    if (!map.has(id)) {
      const entry = {
        id,
        name: r[nameField] || '(sem nome)',
        status: null,
        effective_status: null,
      }
      for (const [k, sourceKey] of Object.entries(parentFields)) {
        entry[k] = r[sourceKey] || null
      }
      map.set(id, entry)
    }
  }
  return Array.from(map.values())
}

export function getCampaigns(accountId) {
  const cached = getCachedCampaigns(accountId)
  if (cached.length > 0) return cached
  // Fallback: extrai de snapshots level=campaign
  return uniqueFromSnapshots(accountId, 'campaign', 'campaign_id', 'campaign_name')
}

export function getAdsets(accountId, campaignId) {
  const cached = getCachedAdsets(accountId, campaignId)
  if (cached.length > 0) return cached
  // Fallback: adsets do snapshot level=adset filtrado pelo campaign_id
  const rows = flatSnapshots(accountId, 'adset', '2020-01-01', '2099-12-31')
    .filter(r => r.campaign_id === campaignId)
  const map = new Map()
  for (const r of rows) {
    if (!r.adset_id) continue
    if (!map.has(r.adset_id)) {
      map.set(r.adset_id, {
        id: r.adset_id,
        name: r.adset_name || '(sem nome)',
        status: null,
        effective_status: null,
        campaign_id: r.campaign_id,
      })
    }
  }
  return Array.from(map.values())
}

export function getAdsWithCreatives(accountId, adsetId) {
  const cached = getCreativesByAdset(accountId, adsetId)
  if (cached.length > 0) return cached
  // Fallback: ads do snapshot level=ad filtrado pelo adset_id, sem thumbnail
  const rows = flatSnapshots(accountId, 'ad', '2020-01-01', '2099-12-31')
    .filter(r => r.adset_id === adsetId)
  const map = new Map()
  for (const r of rows) {
    if (!r.ad_id) continue
    if (!map.has(r.ad_id)) {
      map.set(r.ad_id, {
        id: r.ad_id,
        name: r.ad_name || '(sem nome)',
        effective_status: null,
        creative: {},   // sem thumbnail (precisa rodar updateStructure pra popular)
      })
    }
  }
  return Array.from(map.values())
}

export function getAllAdsWithCreatives(accountId) {
  const cached = getCreativesByAccount(accountId)
  if (cached.length > 0) return cached
  // Fallback: todos ads do snapshot level=ad
  const rows = flatSnapshots(accountId, 'ad', '2020-01-01', '2099-12-31')
  const map = new Map()
  for (const r of rows) {
    if (!r.ad_id) continue
    if (!map.has(r.ad_id)) {
      map.set(r.ad_id, {
        id: r.ad_id,
        name: r.ad_name || '(sem nome)',
        campaign_id: r.campaign_id,
        adset_id: r.adset_id,
        effective_status: null,
        creative: {},
      })
    }
  }
  return Array.from(map.values())
}

// ============ META INFO ============

export function getAccountLastSync(accountId) {
  return getAccountLatestUpdate(accountId)
}
