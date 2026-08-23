// SQLite local do core — snapshots do Meta Ads + configs de dashboard + rotas publicas
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_DIR = resolve(__dirname, 'data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(resolve(DB_DIR, 'core.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ============ SCHEMA ============
db.exec(`
  CREATE TABLE IF NOT EXISTS meta_snapshots (
    account_id     TEXT NOT NULL,
    snapshot_date  TEXT NOT NULL,           -- YYYY-MM-DD
    level          TEXT NOT NULL,           -- 'account' | 'campaign' | 'adset' | 'ad'
    data_json      TEXT NOT NULL,           -- JSON array of insights
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, snapshot_date, level)
  );
  CREATE INDEX IF NOT EXISTS idx_snap_account_date ON meta_snapshots(account_id, snapshot_date DESC);

  CREATE TABLE IF NOT EXISTS meta_creatives_cache (
    account_id     TEXT NOT NULL,
    ad_id          TEXT NOT NULL,
    ad_name        TEXT,
    campaign_id    TEXT,
    adset_id       TEXT,
    effective_status TEXT,
    creative_json  TEXT NOT NULL,           -- JSON do creative (thumb, image_url, etc)
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, ad_id)
  );
  CREATE INDEX IF NOT EXISTS idx_creatives_account ON meta_creatives_cache(account_id);

  CREATE TABLE IF NOT EXISTS meta_structure_cache (
    account_id     TEXT NOT NULL,
    entity_type    TEXT NOT NULL,           -- 'campaign' | 'adset'
    entity_id      TEXT NOT NULL,
    parent_id      TEXT,                    -- adset -> campaign_id
    name           TEXT,
    status         TEXT,
    effective_status TEXT,
    daily_budget   TEXT,
    lifetime_budget TEXT,
    objective      TEXT,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, entity_type, entity_id)
  );
  CREATE INDEX IF NOT EXISTS idx_struct_account_type ON meta_structure_cache(account_id, entity_type);
  CREATE INDEX IF NOT EXISTS idx_struct_parent ON meta_structure_cache(parent_id);

  CREATE TABLE IF NOT EXISTS snapshot_runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_started    TEXT NOT NULL DEFAULT (datetime('now')),
    run_ended      TEXT,
    accounts_total INTEGER,
    accounts_ok    INTEGER,
    accounts_err   INTEGER,
    error_log      TEXT
  );

  CREATE TABLE IF NOT EXISTS dashboard_configs (
    account_id     TEXT PRIMARY KEY,
    config_json    TEXT NOT NULL,           -- JSON com sections/metricas/ordem
    public_slug    TEXT UNIQUE,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_dash_slug ON dashboard_configs(public_slug);

  CREATE TABLE IF NOT EXISTS dashboard_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    config_json    TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Google Ads snapshots (por dia por customer, com data_json arrays)
  CREATE TABLE IF NOT EXISTS gads_snapshots (
    customer_id    TEXT NOT NULL,     -- ID sem hifens
    snapshot_date  TEXT NOT NULL,
    kind           TEXT NOT NULL,     -- 'account' | 'campaign' | 'keyword' | 'device' | 'hourly' | 'conversion'
    data_json      TEXT NOT NULL,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (customer_id, snapshot_date, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_gads_snap ON gads_snapshots(customer_id, snapshot_date DESC);

  -- Instagram snapshots (diario por ig_id)
  CREATE TABLE IF NOT EXISTS ig_snapshots (
    ig_id          TEXT NOT NULL,
    snapshot_date  TEXT NOT NULL,
    kind           TEXT NOT NULL,     -- 'profile' | 'daily_insights' | 'audience'
    data_json      TEXT NOT NULL,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (ig_id, snapshot_date, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_ig_snap ON ig_snapshots(ig_id, snapshot_date DESC);

  CREATE TABLE IF NOT EXISTS ig_media_cache (
    ig_id          TEXT NOT NULL,
    media_id       TEXT NOT NULL,
    media_json     TEXT NOT NULL,     -- caption, media_type, thumbnail_url, permalink, timestamp, insights
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (ig_id, media_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ig_media ON ig_media_cache(ig_id);

  -- GA4 snapshots
  CREATE TABLE IF NOT EXISTS ga4_snapshots (
    property_id    TEXT NOT NULL,
    snapshot_date  TEXT NOT NULL,
    kind           TEXT NOT NULL,     -- 'overview' | 'traffic_sources' | 'pages'
    data_json      TEXT NOT NULL,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (property_id, snapshot_date, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_ga4_snap ON ga4_snapshots(property_id, snapshot_date DESC);

  -- Cache generico de respostas HTTP (Google Ads/IG/GA4 endpoints custom)
  -- Chave: 'GADS:customerId:kind:days:since:until' (ou similar por API)
  CREATE TABLE IF NOT EXISTS api_cache (
    cache_key    TEXT PRIMARY KEY,
    value_json   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,        -- ISO datetime
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_api_cache_exp ON api_cache(expires_at);
`)

// ============ SNAPSHOTS ============
const upsertSnapshot = db.prepare(`
  INSERT INTO meta_snapshots (account_id, snapshot_date, level, data_json, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(account_id, snapshot_date, level) DO UPDATE SET
    data_json = excluded.data_json,
    updated_at = datetime('now')
`)

const selectSnapshotRange = db.prepare(`
  SELECT snapshot_date, data_json
  FROM meta_snapshots
  WHERE account_id = ? AND level = ?
    AND snapshot_date >= ? AND snapshot_date <= ?
  ORDER BY snapshot_date ASC
`)

const selectLatestSnapshotDate = db.prepare(`
  SELECT MAX(updated_at) as latest FROM meta_snapshots WHERE account_id = ?
`)

export function saveSnapshot(accountId, date, level, dataArray) {
  upsertSnapshot.run(accountId, date, level, JSON.stringify(dataArray || []))
}

export function getSnapshotsInRange(accountId, level, since, until) {
  const rows = selectSnapshotRange.all(accountId, level, since, until)
  return rows.map(r => ({ date: r.snapshot_date, data: JSON.parse(r.data_json) }))
}

export function getAccountLatestUpdate(accountId) {
  const row = selectLatestSnapshotDate.get(accountId)
  return row?.latest || null
}

// ============ CREATIVES ============
const upsertCreative = db.prepare(`
  INSERT INTO meta_creatives_cache (account_id, ad_id, ad_name, campaign_id, adset_id, effective_status, creative_json, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(account_id, ad_id) DO UPDATE SET
    ad_name = excluded.ad_name,
    campaign_id = excluded.campaign_id,
    adset_id = excluded.adset_id,
    effective_status = excluded.effective_status,
    creative_json = excluded.creative_json,
    updated_at = datetime('now')
`)

const selectCreativesByAccount = db.prepare(`
  SELECT ad_id, ad_name, campaign_id, adset_id, effective_status, creative_json
  FROM meta_creatives_cache WHERE account_id = ?
`)

const selectCreativesByAdset = db.prepare(`
  SELECT ad_id, ad_name, effective_status, creative_json
  FROM meta_creatives_cache WHERE account_id = ? AND adset_id = ?
`)

export function saveCreative(accountId, ad) {
  upsertCreative.run(
    accountId,
    ad.id,
    ad.name || null,
    ad.campaign_id || null,
    ad.adset_id || null,
    ad.effective_status || null,
    JSON.stringify(ad.creative || {})
  )
}

export function getCreativesByAccount(accountId) {
  return selectCreativesByAccount.all(accountId).map(r => ({
    id: r.ad_id, name: r.ad_name, campaign_id: r.campaign_id, adset_id: r.adset_id,
    effective_status: r.effective_status,
    creative: JSON.parse(r.creative_json || '{}'),
  }))
}

export function getCreativesByAdset(accountId, adsetId) {
  return selectCreativesByAdset.all(accountId, adsetId).map(r => ({
    id: r.ad_id, name: r.ad_name, effective_status: r.effective_status,
    creative: JSON.parse(r.creative_json || '{}'),
  }))
}

// ============ STRUCTURE (campaigns / adsets) ============
const upsertStructure = db.prepare(`
  INSERT INTO meta_structure_cache (account_id, entity_type, entity_id, parent_id, name, status, effective_status, daily_budget, lifetime_budget, objective, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(account_id, entity_type, entity_id) DO UPDATE SET
    parent_id = excluded.parent_id,
    name = excluded.name,
    status = excluded.status,
    effective_status = excluded.effective_status,
    daily_budget = excluded.daily_budget,
    lifetime_budget = excluded.lifetime_budget,
    objective = excluded.objective,
    updated_at = datetime('now')
`)

const selectCampaignsByAccount = db.prepare(`
  SELECT entity_id, name, status, effective_status, daily_budget, lifetime_budget, objective
  FROM meta_structure_cache
  WHERE account_id = ? AND entity_type = 'campaign'
`)

const selectAdsetsByCampaign = db.prepare(`
  SELECT entity_id, parent_id, name, status, effective_status, daily_budget, lifetime_budget
  FROM meta_structure_cache
  WHERE account_id = ? AND entity_type = 'adset' AND parent_id = ?
`)

export function saveCampaignStructure(accountId, c) {
  upsertStructure.run(accountId, 'campaign', c.id, null, c.name || null, c.status || null, c.effective_status || null, c.daily_budget || null, c.lifetime_budget || null, c.objective || null)
}

export function saveAdsetStructure(accountId, campaignId, a) {
  upsertStructure.run(accountId, 'adset', a.id, campaignId, a.name || null, a.status || null, a.effective_status || null, a.daily_budget || null, a.lifetime_budget || null, null)
}

export function getCachedCampaigns(accountId) {
  return selectCampaignsByAccount.all(accountId).map(r => ({
    id: r.entity_id, name: r.name, status: r.status, effective_status: r.effective_status,
    daily_budget: r.daily_budget, lifetime_budget: r.lifetime_budget, objective: r.objective,
  }))
}

export function getCachedAdsets(accountId, campaignId) {
  return selectAdsetsByCampaign.all(accountId, campaignId).map(r => ({
    id: r.entity_id, name: r.name, status: r.status, effective_status: r.effective_status,
    daily_budget: r.daily_budget, lifetime_budget: r.lifetime_budget,
  }))
}

// ============ SNAPSHOT RUNS ============
const insertRun = db.prepare(`INSERT INTO snapshot_runs (accounts_total, accounts_ok, accounts_err) VALUES (?, 0, 0)`)
const updateRunEnd = db.prepare(`UPDATE snapshot_runs SET run_ended = datetime('now'), accounts_ok = ?, accounts_err = ?, error_log = ? WHERE id = ?`)

export function startRun(total) {
  return insertRun.run(total).lastInsertRowid
}

export function endRun(runId, ok, err, errorLog) {
  updateRunEnd.run(ok, err, errorLog || null, runId)
}

// ============ DASHBOARD CONFIGS ============
const upsertConfig = db.prepare(`
  INSERT INTO dashboard_configs (account_id, config_json, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(account_id) DO UPDATE SET
    config_json = excluded.config_json,
    updated_at = datetime('now')
`)

const selectConfig = db.prepare(`SELECT config_json, public_slug FROM dashboard_configs WHERE account_id = ?`)
const selectConfigBySlug = db.prepare(`SELECT account_id, config_json FROM dashboard_configs WHERE public_slug = ?`)
const updateSlug = db.prepare(`UPDATE dashboard_configs SET public_slug = ?, updated_at = datetime('now') WHERE account_id = ?`)

export function getDashboardConfig(accountId) {
  const row = selectConfig.get(accountId)
  if (!row) return { config: null, public_slug: null }
  return { config: JSON.parse(row.config_json), public_slug: row.public_slug }
}

export function saveDashboardConfig(accountId, config) {
  upsertConfig.run(accountId, JSON.stringify(config))
}

export function setDashboardSlug(accountId, slug) {
  updateSlug.run(slug, accountId)
}

export function getConfigBySlug(slug) {
  const row = selectConfigBySlug.get(slug)
  if (!row) return null
  return { account_id: row.account_id, config: JSON.parse(row.config_json) }
}

// ============ TEMPLATES ============
const insertTemplate = db.prepare(`INSERT INTO dashboard_templates (name, config_json) VALUES (?, ?)`)
const selectTemplates = db.prepare(`SELECT id, name, created_at FROM dashboard_templates ORDER BY created_at DESC`)
const selectTemplate = db.prepare(`SELECT config_json FROM dashboard_templates WHERE id = ?`)
const deleteTemplate = db.prepare(`DELETE FROM dashboard_templates WHERE id = ?`)

export function saveTemplate(name, config) { return insertTemplate.run(name, JSON.stringify(config)).lastInsertRowid }
export function listTemplates() { return selectTemplates.all() }
export function getTemplate(id) { const r = selectTemplate.get(id); return r ? JSON.parse(r.config_json) : null }
export function removeTemplate(id) { deleteTemplate.run(id) }

// ============ GOOGLE ADS SNAPSHOTS ============
const upsertGadsSnap = db.prepare(`
  INSERT INTO gads_snapshots (customer_id, snapshot_date, kind, data_json, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(customer_id, snapshot_date, kind) DO UPDATE SET
    data_json = excluded.data_json,
    updated_at = datetime('now')
`)
const selectGadsRange = db.prepare(`
  SELECT snapshot_date, data_json FROM gads_snapshots
  WHERE customer_id = ? AND kind = ? AND snapshot_date >= ? AND snapshot_date <= ?
  ORDER BY snapshot_date ASC
`)
const selectGadsLatest = db.prepare(`SELECT MAX(updated_at) as latest FROM gads_snapshots WHERE customer_id = ?`)

export function saveGadsSnapshot(customerId, date, kind, data) {
  upsertGadsSnap.run(customerId, date, kind, JSON.stringify(data || []))
}
export function getGadsSnapshotsInRange(customerId, kind, since, until) {
  return selectGadsRange.all(customerId, kind, since, until)
    .map(r => ({ date: r.snapshot_date, data: JSON.parse(r.data_json) }))
}
export function getGadsLatestUpdate(customerId) {
  const r = selectGadsLatest.get(customerId); return r?.latest || null
}

// ============ INSTAGRAM SNAPSHOTS ============
const upsertIgSnap = db.prepare(`
  INSERT INTO ig_snapshots (ig_id, snapshot_date, kind, data_json, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(ig_id, snapshot_date, kind) DO UPDATE SET
    data_json = excluded.data_json,
    updated_at = datetime('now')
`)
const selectIgRange = db.prepare(`
  SELECT snapshot_date, data_json FROM ig_snapshots
  WHERE ig_id = ? AND kind = ? AND snapshot_date >= ? AND snapshot_date <= ?
  ORDER BY snapshot_date ASC
`)
const selectIgLatest = db.prepare(`SELECT MAX(updated_at) as latest FROM ig_snapshots WHERE ig_id = ?`)
const upsertIgMedia = db.prepare(`
  INSERT INTO ig_media_cache (ig_id, media_id, media_json, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(ig_id, media_id) DO UPDATE SET
    media_json = excluded.media_json,
    updated_at = datetime('now')
`)
const selectIgMedia = db.prepare(`SELECT media_id, media_json FROM ig_media_cache WHERE ig_id = ? ORDER BY updated_at DESC LIMIT ?`)

export function saveIgSnapshot(igId, date, kind, data) {
  upsertIgSnap.run(igId, date, kind, JSON.stringify(data || {}))
}
export function getIgSnapshotsInRange(igId, kind, since, until) {
  return selectIgRange.all(igId, kind, since, until)
    .map(r => ({ date: r.snapshot_date, data: JSON.parse(r.data_json) }))
}
export function getIgLatestUpdate(igId) {
  const r = selectIgLatest.get(igId); return r?.latest || null
}
export function saveIgMedia(igId, mediaObj) {
  upsertIgMedia.run(igId, mediaObj.id, JSON.stringify(mediaObj))
}
export function getIgMedia(igId, limit = 50) {
  return selectIgMedia.all(igId, limit).map(r => JSON.parse(r.media_json))
}

// ============ GA4 SNAPSHOTS ============
const upsertGa4Snap = db.prepare(`
  INSERT INTO ga4_snapshots (property_id, snapshot_date, kind, data_json, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(property_id, snapshot_date, kind) DO UPDATE SET
    data_json = excluded.data_json,
    updated_at = datetime('now')
`)
const selectGa4Range = db.prepare(`
  SELECT snapshot_date, data_json FROM ga4_snapshots
  WHERE property_id = ? AND kind = ? AND snapshot_date >= ? AND snapshot_date <= ?
  ORDER BY snapshot_date ASC
`)
const selectGa4Latest = db.prepare(`SELECT MAX(updated_at) as latest FROM ga4_snapshots WHERE property_id = ?`)

export function saveGa4Snapshot(propertyId, date, kind, data) {
  upsertGa4Snap.run(propertyId, date, kind, JSON.stringify(data || {}))
}
export function getGa4SnapshotsInRange(propertyId, kind, since, until) {
  return selectGa4Range.all(propertyId, kind, since, until)
    .map(r => ({ date: r.snapshot_date, data: JSON.parse(r.data_json) }))
}
export function getGa4LatestUpdate(propertyId) {
  const r = selectGa4Latest.get(propertyId); return r?.latest || null
}

// ============ API CACHE GENERICO (Google Ads/IG/GA4 respostas HTTP) ============
const upsertApiCache = db.prepare(`
  INSERT INTO api_cache (cache_key, value_json, expires_at, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(cache_key) DO UPDATE SET
    value_json = excluded.value_json,
    expires_at = excluded.expires_at,
    updated_at = datetime('now')
`)
const selectApiCache = db.prepare(`SELECT value_json, updated_at, expires_at FROM api_cache WHERE cache_key = ? AND expires_at > datetime('now')`)
const selectApiCacheStale = db.prepare(`SELECT value_json, updated_at FROM api_cache WHERE cache_key = ?`)
const cleanExpired = db.prepare(`DELETE FROM api_cache WHERE expires_at < datetime('now', '-7 days')`)

// Coleta lixo a cada boot
cleanExpired.run()

/**
 * Cache wrapper: se ha valor fresco, retorna. Senao chama factory, salva e retorna.
 * Se factory falhar, tenta retornar valor stale (fora do TTL) se existir — pra
 * o dashboard nunca ficar branco quando o Google/Meta esta com rate limit.
 */
export async function apiCached(key, ttlMinutes, factory) {
  const hit = selectApiCache.get(key)
  if (hit) {
    return { data: JSON.parse(hit.value_json), from: 'cache', updated: hit.updated_at }
  }
  try {
    const value = await factory()
    const expiresAt = new Date(Date.now() + ttlMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ')
    upsertApiCache.run(key, JSON.stringify(value), expiresAt)
    return { data: value, from: 'live', updated: new Date().toISOString().slice(0, 19).replace('T', ' ') }
  } catch (err) {
    // Fallback: se falhou (rate limit etc), tenta cache stale
    const stale = selectApiCacheStale.get(key)
    if (stale) return { data: JSON.parse(stale.value_json), from: 'stale', updated: stale.updated_at, error: err.message }
    throw err
  }
}

export function cacheGet(key) {
  const hit = selectApiCache.get(key)
  return hit ? { data: JSON.parse(hit.value_json), updated: hit.updated_at } : null
}
export function cacheSet(key, value, ttlMinutes) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ')
  upsertApiCache.run(key, JSON.stringify(value), expiresAt)
}

export default db
