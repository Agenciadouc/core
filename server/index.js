import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

// Polyfill fetch for Node 16
if (!globalThis.fetch) {
  const mod = await import('node-fetch')
  globalThis.fetch = mod.default
  globalThis.URLSearchParams = globalThis.URLSearchParams || URL.URLSearchParams
}

// SQLite + snapshots + cron (Fase 0)
import * as agg from './aggregate.js'
import { syncAllAccounts, syncAccount } from './snapshots.js'
import {
  getDashboardConfig, saveDashboardConfig, setDashboardSlug, getConfigBySlug,
  saveTemplate, listTemplates, getTemplate, removeTemplate,
  getAccountLatestUpdate,
  apiCached, cacheGet, cacheSet,
} from './db.js'

// TTL padrao pro cache HTTP das outras APIs (Google Ads/IG/GA4)
// 4h = balanco entre freshness e reducao de chamadas.
const OTHER_APIS_CACHE_MIN = 240  // 4 horas

/**
 * Middleware que faz cache automatico baseado na URL completa.
 * - Se ha valor fresco no cache, retorna direto sem chamar o handler
 * - Senao, chama o handler normalmente e intercepta res.json pra salvar
 * - Query param ?refresh=1 força bypass (usado pelo botao Sincronizar)
 */
function cacheMiddleware(req, res, next) {
  if (req.query.refresh === '1') return next()
  const key = `${req.method}:${req.originalUrl.split('?')[0]}?${new URLSearchParams(req.query).toString()}`
  const hit = cacheGet(key)
  if (hit) {
    return res.json({ ...hit.data, _cache_meta: { from: 'cache', updated: hit.updated } })
  }
  const originalJson = res.json.bind(res)
  res.json = (body) => {
    // Nao cacheia erros (statusCode >= 400) nem respostas com "error" no corpo
    if (res.statusCode < 400 && body && !body.error) {
      cacheSet(key, body, OTHER_APIS_CACHE_MIN)
    }
    return originalJson({ ...body, _cache_meta: { from: 'live', updated: new Date().toISOString().slice(0,19).replace('T',' ') } })
  }
  next()
}
import cron from 'node-cron'
import { nanoid } from 'nanoid'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const app = express()
app.use(cors())
app.use(express.json())

// Strip /core prefix so /core/api/... maps to /api/...
app.use((req, _res, next) => {
  if (req.url.startsWith('/core/api/')) req.url = req.url.slice(5)
  next()
})

const JWT_SECRET = process.env.JWT_SECRET || 'dros-dashboard-secret-2026'
const PORT = process.env.PORT || 3004

// =====================================================================
// Hub integration: /core agora puxa tokens e lista de clientes do Hub.
// Fallback pro .env mantido pra zero-downtime quando Hub estiver offline.
//
// HUB_URL — base do Hub (default localhost:3003 na VPS)
// CORE_EMBED_SECRET — chave compartilhada (mesma usada pelo auto-login iframe)
// =====================================================================
const HUB_URL = process.env.HUB_URL || 'http://localhost:3003'
const CORE_EMBED_SECRET = process.env.CORE_EMBED_SECRET || 'dros-core-embed-2026-shared-key'

// Tokens: let porque sao atualizados periodicamente do Hub
let META_TOKEN = process.env.META_ACCESS_TOKEN
// Kiwify mantido como const local (sem sync no Hub — nao faz parte do painel de performance)
const KIWIFY_CLIENT_ID = process.env.KIWIFY_CLIENT_ID
const KIWIFY_CLIENT_SECRET = process.env.KIWIFY_CLIENT_SECRET
const KIWIFY_ACCOUNT_ID = process.env.KIWIFY_ACCOUNT_ID
let GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
let GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
let GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET
let GOOGLE_ADS_REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN
let GOOGLE_ADS_LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

// Nomes de clientes vindos do Hub (substituem/expandem ALLOWED_CLIENTS hardcoded)
let HUB_CLIENT_NAMES = []
// Config completa dos clientes vinda do Hub (core_client_name + core_meta_account_id +
// core_ig_page_id + core_gads_customer_id + core_ga4_property_id). Usada pra fixar
// exatamente qual IG/Meta/Ads pegar por cliente, sem fuzzy match ambiguo.
let HUB_CLIENTS = []

// Retorna a config do cliente Hub que casa com o accountName recebido do frontend.
// Match ordem: core_client_name === name → name (raw) === name → substring.
// Retorna null se nao achar (a rota decide fazer fallback ou nao).
function getHubClientConfig(accountName) {
  if (!accountName) return null
  const lower = accountName.toLowerCase().trim()
  // Match exato primeiro
  const exact = HUB_CLIENTS.find(c => {
    const coreName = (c.core_client_name || '').toLowerCase().trim()
    const name     = (c.name || '').toLowerCase().trim()
    return (coreName && coreName === lower) || (name && name === lower)
  })
  if (exact) return exact
  // Substring como fallback (caso accountName venha de outra fonte, ex: "CA - Gui Autocar Mecanica")
  return HUB_CLIENTS.find(c => {
    const coreName = (c.core_client_name || '').toLowerCase().trim()
    const name     = (c.name || '').toLowerCase().trim()
    return (coreName && lower.includes(coreName)) || (name && lower.includes(name))
  }) || null
}

// Fetch tokens + lista de clientes do Hub. Roda no startup e a cada 10 min.
async function syncFromHub() {
  try {
    const headers = { 'X-Core-Secret': CORE_EMBED_SECRET }
    const [tokensRes, clientsRes] = await Promise.all([
      fetch(`${HUB_URL}/api/config/tokens`, { headers }),
      fetch(`${HUB_URL}/api/config/clients`, { headers }),
    ])
    if (tokensRes.ok) {
      const { tokens } = await tokensRes.json()
      // Atualiza apenas se Hub retornou valor (preserva fallback .env)
      if (tokens.META_ACCESS_TOKEN) META_TOKEN = tokens.META_ACCESS_TOKEN
      if (tokens.GOOGLE_ADS_DEVELOPER_TOKEN) GOOGLE_ADS_DEVELOPER_TOKEN = tokens.GOOGLE_ADS_DEVELOPER_TOKEN
      if (tokens.GOOGLE_ADS_CLIENT_ID) GOOGLE_ADS_CLIENT_ID = tokens.GOOGLE_ADS_CLIENT_ID
      if (tokens.GOOGLE_ADS_CLIENT_SECRET) GOOGLE_ADS_CLIENT_SECRET = tokens.GOOGLE_ADS_CLIENT_SECRET
      if (tokens.GOOGLE_ADS_REFRESH_TOKEN) GOOGLE_ADS_REFRESH_TOKEN = tokens.GOOGLE_ADS_REFRESH_TOKEN
      if (tokens.GOOGLE_ADS_LOGIN_CUSTOMER_ID) GOOGLE_ADS_LOGIN_CUSTOMER_ID = tokens.GOOGLE_ADS_LOGIN_CUSTOMER_ID
      console.log('[Hub sync] tokens atualizados', Object.keys(tokens).length, 'chaves')
    }
    if (clientsRes.ok) {
      const { clients } = await clientsRes.json()
      HUB_CLIENTS = clients
      HUB_CLIENT_NAMES = clients.map(c => (c.core_client_name || c.name || '').trim()).filter(Boolean)
      console.log('[Hub sync] clientes recebidos:', HUB_CLIENTS.length,
        '| com IG vinculada:', HUB_CLIENTS.filter(c => c.core_ig_page_id).length)
    }
  } catch (err) {
    console.error('[Hub sync] falhou (usando fallback .env):', err.message)
  }
}

// Inicia sync no startup (nao bloqueante) e repete a cada 10min
syncFromHub()
setInterval(syncFromHub, 10 * 60 * 1000)

// --- Allowed clients (substring match against account/page name) ---
// Hardcoded mantida como fallback. Lista dinamica (HUB_CLIENT_NAMES) e somada
// em isAllowedAccount(). Pra remover um cliente, basta arquivar no Hub
// (is_active=0) — sem precisar mexer aqui.
const ALLOWED_CLIENTS = [
  'quimiprol',
  'ask equipamentos', 'ask ',
  "d'avila", 'davila',
  'door grill - conta 02', 'door grill - conta 03', 'doorgrill', 'door grill churrasqueira', 'door grill portas', 'doorgrill fechamento',
  'daiana',
  'renove',
  'sameco',
  'josi terapeuta', 'josiane', 'josianevargasdelfino',
  'bg imob', 'bg im',
  'autocar', 'gui autocar', 'gui auto car', 'bm mec',
  'fernando correa', 'fernandomoc', 'deividjrs', 'dros.sales', 'dros sales', 'tainacristina', 'taina cristina',
  'kellermann',
  'ludus',
  'invista',
  'essenza',
  'mb vidros', 'mbvidros',
  'agrozacca',
  'emdi',
  'oxi dpr', 'dpr',
  'box paper',
  'ambiental higiene',
  'gringa',
  'telhabras', 'telha.bras',
]

function isAllowedAccount(name) {
  const lower = name.toLowerCase()
  if (ALLOWED_CLIENTS.some((pattern) => lower.includes(pattern))) return true
  // Hub-provided clients: match substring do nome completo (lowercase)
  return HUB_CLIENT_NAMES.some(n => lower.includes(n.toLowerCase()))
}

// --- Admin users ---
const USERS = [
  {
    id: 'admin',
    email: 'admin@drosagencia.com.br',
    password: bcrypt.hashSync('dros2026', 10),
    name: 'Dros Admin',
    role: 'admin',
  },
]

// CORE_EMBED_SECRET ja declarado no topo (usado tanto pra sync com Hub quanto pra embed JWT)

// --- Auth middleware ---
function auth(req, res, next) {
  // 1) Embed token via query (?embed_token=XXX) ou header — auto-login do /hub
  const embedToken = req.query.embed_token || (req.headers['x-embed-token'])
  if (embedToken) {
    try {
      const payload = jwt.verify(embedToken, CORE_EMBED_SECRET)
      if (payload.embed === true) {
        req.user = { id: 'embed', email: 'embed@dros', name: 'Dros Embed', role: 'admin', embed: true, embed_account: payload.account }
        return next()
      }
    } catch { /* invalid — cai pro fluxo normal */ }
  }
  // 2) Header normal (Authorization: Bearer JWT)
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const t = header.slice(7)
    // Tenta como token normal (usuarios reais)
    try { req.user = jwt.verify(t, JWT_SECRET); return next() } catch {}
    // Tenta como embed token (frontend que recebeu o token via URL e agora chama API com ele no header)
    try {
      const payload = jwt.verify(t, CORE_EMBED_SECRET)
      if (payload.embed === true) {
        req.user = { id: 'embed', email: 'embed@dros', name: 'Dros Embed', role: 'admin', embed: true, embed_account: payload.account }
        return next()
      }
    } catch {}
    return res.status(401).json({ error: 'Invalid token' })
  }
  return res.status(401).json({ error: 'No token' })
}

// --- Auth routes ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  const user = USERS.find((u) => u.email === email)
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciais invalidas' })
  }
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
})

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user })
})

app.post('/api/auth/logout', (_req, res) => {
  res.json({ ok: true })
})

// --- Meta API proxy ---
const META_BASE = 'https://graph.facebook.com/v21.0'

async function metaFetch(path, params = {}) {
  const url = new URL(`${META_BASE}${path}`)
  url.searchParams.set('access_token', META_TOKEN)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const resp = await fetch(url.toString())
  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || 'Meta API error')
  return data
}

function fmtDate(date) {
  return date.toISOString().split('T')[0]
}

function getDateRanges(days, since, until) {
  if (since && until) {
    const start = new Date(since + 'T00:00:00')
    const end = new Date(until + 'T00:00:00')
    const diffDays = Math.ceil((end - start) / 86400000) + 1

    const prevEnd = new Date(start)
    prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevStart.getDate() - diffDays + 1)

    return {
      current: { since: fmtDate(start), until: fmtDate(end) },
      previous: { since: fmtDate(prevStart), until: fmtDate(prevEnd) },
    }
  }

  const now = new Date()
  const end = new Date(now)
  end.setDate(end.getDate() - 1) // yesterday

  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)

  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1)

  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - days + 1)

  return {
    current: { since: fmtDate(start), until: fmtDate(end) },
    previous: { since: fmtDate(prevStart), until: fmtDate(prevEnd) },
  }
}

// List ad accounts — MONTADA DIRETO DO HUB (sem chamar Meta pra listar).
// Isso evita bater no rate limit toda vez que o dashboard abre.
// Os dados de insights ja vem do cache SQLite (endpoints /cached/*).
// Se quiser info extra da Meta (amount_spent atual, currency), o Meta API
// so eh chamada UMA VEZ e cacheada — se der rate limit, cai no Hub-only.
let META_ACCOUNTS_CACHE = { data: null, at: 0 }
const META_ACCOUNTS_TTL_MS = 30 * 60 * 1000  // 30 min

async function fetchMetaAccountsCached() {
  const now = Date.now()
  if (META_ACCOUNTS_CACHE.data && (now - META_ACCOUNTS_CACHE.at) < META_ACCOUNTS_TTL_MS) {
    return META_ACCOUNTS_CACHE.data
  }
  try {
    let all = []
    let url = `${META_BASE}/me/adaccounts?fields=id,name,account_status,currency,amount_spent&limit=200&access_token=${META_TOKEN}`
    while (url) {
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.error) throw new Error(data.error.message)
      all = all.concat(data.data || [])
      url = data.paging?.next || null
    }
    META_ACCOUNTS_CACHE = { data: all, at: now }
    return all
  } catch (err) {
    // Se Meta falhou (rate limit etc), retorna o cache velho se existir
    if (META_ACCOUNTS_CACHE.data) return META_ACCOUNTS_CACHE.data
    return []
  }
}

app.get('/api/meta/accounts', auth, async (req, res) => {
  try {
    // Se Hub sync ainda nao rodou (HUB_CLIENTS vazio), forca uma vez antes
    if (!HUB_CLIENTS.length) await syncFromHub()

    // Constroi lista base direto do Hub — nao precisa Meta pra saber o que existe
    const hubAccounts = HUB_CLIENTS
      .filter(c => (c.core_meta_account_id || '').trim())
      .map(c => {
        const rawId = c.core_meta_account_id.trim()
        const withPrefix = rawId.startsWith('act_') ? rawId : `act_${rawId}`
        return {
          id: withPrefix,
          name: (c.core_client_name || c.name || 'Sem nome').trim(),
          account_status: 1,       // assume ativa (Meta seria a fonte real, mas Hub controla o filtro)
          currency: 'BRL',
          amount_spent: '0',
          _hub_client_id: c.id,
        }
      })

    if (hubAccounts.length === 0) {
      return res.json({ accounts: [], warning: 'Nenhum cliente com conta Meta configurada no Hub' })
    }

    // Best effort: enriquece com dados Meta se disponivel (cacheado 30min, tolera rate limit)
    try {
      const metaAccounts = await fetchMetaAccountsCached()
      if (metaAccounts.length > 0) {
        const metaMap = new Map(metaAccounts.map(a => [a.id, a]))
        for (const hubAcc of hubAccounts) {
          const meta = metaMap.get(hubAcc.id)
          if (meta) {
            hubAcc.account_status = meta.account_status
            hubAcc.currency = meta.currency
            hubAcc.amount_spent = meta.amount_spent
          }
        }
      }
    } catch (_) {
      // Silently fail — usamos os dados-base do Hub
    }

    hubAccounts.sort((a, b) => a.name.localeCompare(b.name))
    res.json({ accounts: hubAccounts, total_hub_clients: hubAccounts.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Limpa cache HTTP das APIs (Google Ads/IG/GA4) — usado pelo botao Sincronizar
// Pode filtrar por padrao: ?scope=google-ads | instagram | analytics | all
import db from './db.js'
app.post('/api/cache/clear', auth, (req, res) => {
  try {
    const scope = req.query.scope || 'all'
    let n = 0
    if (scope === 'all') {
      n = db.prepare('DELETE FROM api_cache').run().changes
    } else if (scope === 'google-ads') {
      n = db.prepare("DELETE FROM api_cache WHERE cache_key LIKE '%/api/google-ads/%'").run().changes
    } else if (scope === 'instagram') {
      n = db.prepare("DELETE FROM api_cache WHERE cache_key LIKE '%/api/instagram/%'").run().changes
    } else if (scope === 'analytics') {
      n = db.prepare("DELETE FROM api_cache WHERE cache_key LIKE '%/api/analytics/%'").run().changes
    }
    res.json({ ok: true, cleared: n, scope })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Forca sync com Hub agora (usar quando adicionar cliente novo no Hub e nao quer aguardar 10 min)
app.post('/api/hub/refresh', auth, async (_req, res) => {
  try {
    await syncFromHub()
    res.json({
      ok: true,
      hub_clients: HUB_CLIENTS.length,
      with_meta: HUB_CLIENTS.filter(c => c.core_meta_account_id).length,
      with_ig: HUB_CLIENTS.filter(c => c.core_ig_page_id).length,
      with_gads: HUB_CLIENTS.filter(c => c.core_gads_customer_id).length,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Account insights with comparison (current vs previous period)
app.get('/api/meta/accounts/:accountId/insights/compare', auth, async (req, res) => {
  try {
    const { accountId } = req.params
    const { days = '30', level = 'account', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const fields = 'spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type,action_values'
    const levelFields = level === 'campaign' ? `campaign_id,campaign_name,${fields}` : fields

    const [current, previous] = await Promise.all([
      metaFetch(`/${accountId}/insights`, {
        fields: levelFields,
        time_range: JSON.stringify(ranges.current),
        level,
        limit: '500',
      }).catch(() => ({ data: [] })),
      metaFetch(`/${accountId}/insights`, {
        fields: levelFields,
        time_range: JSON.stringify(ranges.previous),
        level,
        limit: '500',
      }).catch(() => ({ data: [] })),
    ])

    res.json({
      current: current.data || [],
      previous: previous.data || [],
      ranges,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Daily insights with comparison
app.get('/api/meta/accounts/:accountId/insights/daily-compare', auth, async (req, res) => {
  try {
    const { accountId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const fields = 'spend,impressions,clicks,cpc,ctr,reach,actions,action_values'

    const [current, previous] = await Promise.all([
      metaFetch(`/${accountId}/insights`, {
        fields,
        time_range: JSON.stringify(ranges.current),
        time_increment: '1',
        limit: '100',
      }).catch(() => ({ data: [] })),
      metaFetch(`/${accountId}/insights`, {
        fields,
        time_range: JSON.stringify(ranges.previous),
        time_increment: '1',
        limit: '100',
      }).catch(() => ({ data: [] })),
    ])

    res.json({
      current: current.data || [],
      previous: previous.data || [],
      ranges,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// INSTAGRAM API
// =============================================

// Get all Instagram business accounts linked to Facebook Pages
// Se ?name=X for passado e o cliente estiver no Hub com core_ig_page_id vinculado,
// retorna SOMENTE aquela pagina (evita fuzzy match cross-cliente no frontend).
// Se cliente esta no Hub sem IG vinculada, retorna array vazio (nao mostra dados de outro).
app.get('/api/instagram/accounts', auth, async (req, res) => {
  try {
    const accountName = (req.query.name || '').trim()
    let allPages = []
    let url = `${META_BASE}/me/accounts?fields=id,name,instagram_business_account{id,name,username,followers_count,follows_count,media_count,profile_picture_url}&limit=100&access_token=${META_TOKEN}`
    while (url) {
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.error) return res.status(400).json(data)
      allPages = allPages.concat(data.data || [])
      url = data.paging?.next || null
    }

    // Se cliente foi passado, resolve pelo Hub
    if (accountName) {
      const hubCfg = getHubClientConfig(accountName)
      const pinnedIgPageId = hubCfg?.core_ig_page_id?.trim() || null
      if (pinnedIgPageId) {
        const match = allPages.find(p =>
          p.instagram_business_account &&
          (p.id === pinnedIgPageId || p.instagram_business_account.id === pinnedIgPageId)
        )
        const igAccounts = match ? [{
          pageId: match.id,
          pageName: match.name,
          ...match.instagram_business_account,
        }] : []
        return res.json({ accounts: igAccounts, source: 'hub-pinned' })
      }
      if (hubCfg) {
        // Cliente no Hub mas sem IG vinculada → nao mostra dados de outro
        return res.json({ accounts: [], source: 'hub-not-linked' })
      }
    }

    // Fallback: retorna todas as pages permitidas (comportamento antigo, pra compat)
    const igAccounts = allPages
      .filter((p) => p.instagram_business_account && isAllowedAccount(p.name))
      .map((p) => ({
        pageId: p.id,
        pageName: p.name,
        ...p.instagram_business_account,
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    res.json({ accounts: igAccounts, source: 'legacy-all' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Instagram profile info
app.get('/api/instagram/:igId/profile', auth, cacheMiddleware, async (req, res) => {
  try {
    const data = await metaFetch(`/${req.params.igId}`, {
      fields: 'id,name,username,followers_count,follows_count,media_count,profile_picture_url,biography',
    })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Instagram account insights (with comparison)
// IG API requires two separate calls: daily metrics (period=day) and total_value metrics
app.get('/api/instagram/:igId/insights', auth, cacheMiddleware, async (req, res) => {
  try {
    const { igId } = req.params
    const { days = '7', since, until } = req.query
    const d = parseInt(days)
    const ranges = getDateRanges(d, since, until)

    const toUnix = (dateStr) => Math.floor(new Date(dateStr + 'T00:00:00').getTime() / 1000)

    // IG API split: some metrics only work with period=day, others need metric_type=total_value
    // Daily breakdown: reach, follower_count
    // Total only: profile_views, total_interactions, accounts_engaged, likes, comments, shares, saves

    async function fetchPeriod(range) {
      const since = String(toUnix(range.since))
      const until = String(toUnix(range.until) + 86400)

      const [dailyReach, dailyFollowers, totals] = await Promise.all([
        metaFetch(`/${igId}/insights`, {
          metric: 'reach',
          period: 'day',
          since, until,
        }).catch(() => ({ data: [] })),
        metaFetch(`/${igId}/insights`, {
          metric: 'follower_count',
          period: 'day',
          since, until,
        }).catch(() => ({ data: [] })),
        metaFetch(`/${igId}/insights`, {
          metric: 'profile_views,total_interactions,accounts_engaged,likes,comments,shares,saves',
          metric_type: 'total_value',
          period: 'day',
          since, until,
        }).catch(() => ({ data: [] })),
      ])

      const result = {}
      const dailyData = {}

      // Process daily metrics (have values array with per-day breakdown)
      for (const dataset of [dailyReach, dailyFollowers]) {
        for (const m of (dataset.data || [])) {
          const values = m.values || []
          result[m.name] = values.reduce((sum, v) => sum + (v.value || 0), 0)
          dailyData[m.name] = values.map((v) => ({ date: v.end_time?.split('T')[0], value: v.value || 0 }))
        }
      }

      // Process total_value metrics (aggregated only, no daily breakdown)
      for (const m of (totals.data || [])) {
        const val = m.total_value?.value || 0
        result[m.name] = val
        // Create a single-point "daily" entry so charts can at least show the total
      }

      return { totals: result, daily: dailyData }
    }

    const [current, previous] = await Promise.all([
      fetchPeriod(ranges.current),
      fetchPeriod(ranges.previous),
    ])

    res.json({ current, previous, ranges })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Instagram recent media with engagement
app.get('/api/instagram/:igId/media', auth, cacheMiddleware, async (req, res) => {
  try {
    const { igId } = req.params
    const { limit = '20' } = req.query
    const data = await metaFetch(`/${igId}/media`, {
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
      limit,
    })
    // Return media without individual insights (avoid rate limiting)
    res.json({ data: (data.data || []).map(m => ({ ...m, insights: {} })) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// CRM (Google Sheets)
// =============================================

// Client CRM spreadsheet mappings
// type: 'invista' = Invista format (LEADS tab), 'kellermann' = Kellermann format (ENTRADA DE LEADS tab)
const CRM_SHEETS = {
  'invista': { id: '1XOKIFDn9HwbWFHrI7tQovV-Vvrk9DqbdA8Skrmr1R4Q', type: 'invista' },
  'kellermann': { id: '1am9NoQoCuIkyAAj4H4QnEnOgWCFSf669wtLVU2EwLko', type: 'kellermann' },
  'sameco': { id: '1u4EnAU1Mqhi4ZqulnI3sYU5-wWkuqo9R67QtJ-usWaY', type: 'sameco' },
  'ludus': { id: '1quQYCC86UGZqx8Cf1uuSoIamm29IgcTfCnwrscFsSOs', type: 'ludus' },
  'bg imob': { id: '1dZjSUqcZJ_4IDyXhRrY9i9GcJvqxCLYp3YTl7Ij45zY', type: 'bgimob' },
  'bg im': { id: '1dZjSUqcZJ_4IDyXhRrY9i9GcJvqxCLYp3YTl7Ij45zY', type: 'bgimob' },
  'fernando correa': { id: '1Eg5qp_3ErytuayQwMinKBjB0emBFoC11veiSdlr3m3o', type: 'fernando' },
}

function getCRMConfig(accountName) {
  const lower = accountName.toLowerCase()
  for (const [pattern, config] of Object.entries(CRM_SHEETS)) {
    if (lower.includes(pattern)) return config
  }
  return null
}

async function fetchSheetCSV(spreadsheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Sheet fetch failed: ${resp.status}`)
  const text = await resp.text()
  // Parse CSV
  const rows = []
  let current = ''
  let inQuotes = false
  const lines = text.split('\n')
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes
    }
    current += (current ? '\n' : '') + line
    if (!inQuotes) {
      rows.push(current)
      current = ''
      inQuotes = false
    }
  }
  if (current) rows.push(current)

  return rows.map(row => {
    const cells = []
    let cell = ''
    let q = false
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '"') { q = !q; continue }
      if (row[i] === ',' && !q) { cells.push(cell.trim()); cell = ''; continue }
      cell += row[i]
    }
    cells.push(cell.trim())
    return cells
  })
}

// Parse Sameco leads from LEADS sheet (Meta Lead Ads format)
function parseSamecoLeads(rows) {
  const leads = []
  const seen = new Set()
  for (const row of rows) {
    if (row.length < 18) continue
    const id = row[0]
    const createdTime = row[1] // ISO format
    const adName = row[3]
    const campaignName = row[7]
    const platform = row[11]
    const interesse = row[12] // sim/nao
    const faixaEnergia = row[13] // faixa conta energia
    const tipo = row[14] // residência/empresa
    const nome = row[16]
    const telefone = row[17]
    // coluna T: ORÇAMENTO (qualificado) / NÃO EXISTE (desq) / NÃO QUER ORÇAR/ORÇAMENTO (desq) / VENDEU (vendido) / vazio (sem qualif)
    const qualRaw = (row[19] || '').trim()
    const qualNorm = qualRaw.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    let qualificacao = ''
    if (qualNorm.includes('VENDEU')) qualificacao = 'VENDEU'
    else if (qualNorm.startsWith('NAO')) qualificacao = 'NÃO' // NAO EXISTE, NAO QUER ORCAR, NAO QUER ORCAMENTO
    else if (qualNorm.includes('ORCAMENTO')) qualificacao = 'SIM' // ORCAMENTO (sem NAO)
    else qualificacao = qualRaw // vazio ou outros

    if (!createdTime || !nome || nome === 'full_name' || id === 'ENTRADA DE LEADS - FORMULARIO') continue

    // Parse ISO date
    let dateObj
    try {
      dateObj = new Date(createdTime)
      if (isNaN(dateObj.getTime())) continue
    } catch { continue }

    // Deduplicate by phone
    const cleanPhone = (telefone || '').replace(/[^\d]/g, '')
    if (cleanPhone && seen.has(cleanPhone)) continue
    if (cleanPhone) seen.add(cleanPhone)

    // Normalize faixa energia
    let faixa = (faixaEnergia || '').toLowerCase().trim()
    if (faixa.includes('até') || faixa.includes('200') && !faixa.includes('400')) faixa = 'Até R$ 200'
    else if (faixa.includes('201') || (faixa.includes('400') && !faixa.includes('700'))) faixa = 'R$ 201 a R$ 400'
    else if (faixa.includes('401') || faixa.includes('700')) faixa = 'R$ 401 a R$ 700'
    else if (faixa.includes('acima') || faixa.includes('700')) faixa = 'Acima de R$ 700'
    else if (faixa) {
      const val = parseInt(faixa.replace(/[^\d]/g, ''))
      if (val <= 200) faixa = 'Até R$ 200'
      else if (val <= 400) faixa = 'R$ 201 a R$ 400'
      else if (val <= 700) faixa = 'R$ 401 a R$ 700'
      else faixa = 'Acima de R$ 700'
    } else faixa = 'Não informado'

    const dateStr = dateObj.toLocaleDateString('pt-BR')

    leads.push({
      date: dateStr,
      dateObj,
      interesse: interesse || '',
      nome,
      origem: platform === 'fb' ? 'Facebook' : platform === 'ig' ? 'Instagram' : platform || '',
      corretor: '',
      visita: '',
      estado: 'Novo',
      qualificacao: qualificacao || '',
      // Sameco specific
      tipo: (tipo || '').toLowerCase().includes('empres') ? 'Empresa' : 'Residência',
      faixaEnergia: faixa,
      campaignName: campaignName || '',
      adName: adName || '',
    })
  }
  return leads
}

// Parse DD/MM/YYYY to Date object
function parseBRDate(str) {
  if (!str) return null
  const parts = str.split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  const year = parseInt(y)
  if (year < 2020) return null // filter out Excel date bugs (1905 etc)
  return new Date(year, parseInt(m) - 1, parseInt(d))
}

// Parse Kellermann leads from per-corretor "Leads Diários" sheets (have Qualificação column)
async function parseKellermannAllSheets(sheetId) {
  const corretores = ['Leads Diários (Bárbara)', 'Leads Diários (Guilherme)', 'Leads Diários (Juliana)']
  const allLeads = []
  const seen = new Set()

  for (const sheetName of corretores) {
    let rows
    try { rows = await fetchSheetCSV(sheetId, sheetName) } catch { continue }

    for (const row of rows) {
      if (row.length < 9) continue
      const num = row[0]
      const status = row[1]
      const imovel = row[3]
      const dateStr = row[4]
      const nome = row[5]
      const contato = row[6]
      const origem = row[7]
      const corretor = row[8]
      const qualificacao = row[10] || '' // column 11 = Qualificação (SIM/NÃO/MEIO TERMO)

      if (!dateStr || !nome || nome === 'Cliente' || num === 'Nº') continue
      const date = parseBRDate(dateStr)
      if (!date) continue

      // Deduplicate by contact
      const cleanContact = (contato || '').replace(/[\s\-\(\)]/g, '')
      if (cleanContact && seen.has(cleanContact)) continue
      if (cleanContact) seen.add(cleanContact)

      allLeads.push({
        date: dateStr,
        dateObj: date,
        interesse: imovel || '',
        nome,
        origem: origem || '',
        corretor: corretor || '',
        visita: '',
        estado: status || 'Novo',
        qualificacao: qualificacao.toUpperCase().trim(),
      })
    }
  }
  return allLeads
}

// Parse Ludus sales from "fechou" sheet
function parseLudusSales(rows) {
  const sales = []
  let lastDateObj = null // inherit date from previous row when missing
  for (const row of rows) {
    if (row.length < 2) continue
    const dateStr = (row[0] || '').trim()
    const nome = (row[1] || '').trim()
    const comercial = (row[3] || '').trim()
    const personal = (row[6] || '').trim()
    // Handle Brazilian number format: 1.298 = 1298, 1.298,50 = 1298.50
    let valorStr = (row[7] || '').replace(/[^\d.,]/g, '')
    if (valorStr.includes('.') && valorStr.includes(',')) {
      valorStr = valorStr.replace(/\./g, '').replace(',', '.')
    } else if (valorStr.includes(',')) {
      valorStr = valorStr.replace(',', '.')
    } else if (valorStr.includes('.') && valorStr.split('.').pop().length === 3) {
      valorStr = valorStr.replace(/\./g, '')
    }
    const canal = (row[8] || '').trim().toLowerCase()

    if (!nome || nome === 'Nome' || dateStr === 'Data da entrada') continue

    // Parse date: DD/MM or DD/MM/YYYY — if empty, use previous row's date
    let dateObj = null
    if (dateStr) {
      const parts = dateStr.split('/')
      if (parts.length >= 2) {
        const d = parseInt(parts[0])
        const m = parseInt(parts[1]) - 1
        const y = parts[2] ? parseInt(parts[2]) : new Date().getFullYear()
        const fullYear = y < 100 ? 2000 + y : y
        dateObj = new Date(fullYear, m, d)
      }
    }
    if (!dateObj || isNaN(dateObj.getTime())) dateObj = lastDateObj
    if (!dateObj) continue
    lastDateObj = dateObj

    const valor = parseFloat(valorStr) || 0

    // Normalize channel names
    let canalNorm = canal
    if (canal.includes('insta') || canal.includes('ig')) canalNorm = 'Instagram'
    else if (canal.includes('whats') || canal.includes('wpp') || canal.includes('zap')) canalNorm = 'WhatsApp'
    else if (canal.includes('presencial') || canal.includes('presenc')) canalNorm = 'Presencial'
    else if (canal.includes('face') || canal.includes('fb')) canalNorm = 'Facebook'
    else if (canal.includes('indica')) canalNorm = 'Indicação'
    else if (canal.includes('site') || canal.includes('web')) canalNorm = 'Site'
    else if (canal) canalNorm = canal.charAt(0).toUpperCase() + canal.slice(1)
    else canalNorm = 'Não informado'

    sales.push({
      date: dateStr,
      dateObj,
      nome,
      comercial,
      personal,
      valor,
      canal: canalNorm,
    })
  }
  return sales
}

// Get CRM data for an account (with date filtering)
app.get('/api/crm/:accountId', auth, async (req, res) => {
  try {
    const accountName = req.query.name || ''
    const days = parseInt(req.query.days || '7')
    const config = getCRMConfig(accountName)
    if (!config) return res.json({ available: false })

    // Ludus has its own response format (sales-based, not lead-based)
    if (config.type === 'ludus') {
      const rows = await fetchSheetCSV(config.id, 'fechou')
      const allSales = parseLudusSales(rows)

      const now = new Date()
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - days)
      cutoff.setHours(0, 0, 0, 0)

      const sales = allSales.filter(s => s.dateObj >= cutoff)
      const prevCutoff = new Date(cutoff)
      prevCutoff.setDate(prevCutoff.getDate() - days)
      const prevSales = allSales.filter(s => s.dateObj >= prevCutoff && s.dateObj < cutoff)

      const totalVendas = sales.length
      const totalValor = sales.reduce((sum, s) => sum + s.valor, 0)
      const prevTotalVendas = prevSales.length
      const prevTotalValor = prevSales.reduce((sum, s) => sum + s.valor, 0)

      // Vendas por canal
      const canalStats = {}
      sales.forEach(s => {
        if (!canalStats[s.canal]) canalStats[s.canal] = { vendas: 0, valor: 0 }
        canalStats[s.canal].vendas++
        canalStats[s.canal].valor += s.valor
      })

      // Vendas por personal
      // Vendas por personal (normalize case)
      const personalStats = {}
      sales.forEach(s => {
        let p = (s.personal || 'Não atribuído').trim()
        if (p && p !== 'Não atribuído') p = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
        if (!personalStats[p]) personalStats[p] = { vendas: 0, valor: 0 }
        personalStats[p].vendas++
        personalStats[p].valor += s.valor
      })

      // Vendas por comercial (normalize case: "kenia" and "Kenia" → "Kenia")
      const comercialStats = {}
      sales.forEach(s => {
        let c = (s.comercial || 'Não atribuído').trim()
        if (c && c !== 'Não atribuído') c = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()
        if (!comercialStats[c]) comercialStats[c] = { vendas: 0, valor: 0 }
        comercialStats[c].vendas++
        comercialStats[c].valor += s.valor
      })

      // Daily sales
      const dailyCounts = {}
      sales.forEach(s => {
        const key = s.dateObj.toISOString().slice(0, 10)
        if (!dailyCounts[key]) dailyCounts[key] = { count: 0, valor: 0 }
        dailyCounts[key].count++
        dailyCounts[key].valor += s.valor
      })
      const dailySales = Object.entries(dailyCounts)
        .map(([date, d]) => ({ date, count: d.count, valor: d.valor }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Ticket médio
      const ticketMedio = totalVendas > 0 ? totalValor / totalVendas : 0
      const prevTicketMedio = prevTotalVendas > 0 ? prevTotalValor / prevTotalVendas : 0

      return res.json({
        available: true,
        crmType: 'ludus',
        totalVendas,
        totalValor,
        ticketMedio,
        previous: { totalVendas: prevTotalVendas, totalValor: prevTotalValor, ticketMedio: prevTicketMedio },
        canalStats,
        personalStats,
        comercialStats,
        dailySales,
      })
    }

    // Fernando Correa — "leads diarios outubro" tab
    if (config.type === 'fernando') {
      const rows = await fetchSheetCSV(config.id, 'leads diarios outubro')

      // Columns: 0=STATUS CLIENTE, 1=PUBLICO, 2=IMOVEL, 3=DATA ENTRADA, 4=NOME,
      // 5=TELEFONE, 6=ORIGEM, 7=FEEDBACK CLIENTE, 8=FEEDBACK CORRETOR, 9=QUALIFICACAO
      const allLeads = []
      const seen = new Set()
      for (const row of rows) {
        if (row.length < 7) continue
        const status = (row[0] || '').trim()
        const nome = (row[4] || '').trim()
        const dateStr = (row[3] || '').trim()
        if (!nome || nome === 'NOME CLIENTE' || !dateStr) continue

        // Parse date (DD/MM/YYYY or DD/MM)
        let dateObj
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          const y = parseInt(parts[2])
          if (y < 2020) continue
          dateObj = new Date(y, parseInt(parts[1]) - 1, parseInt(parts[0]))
        } else if (parts.length === 2) {
          dateObj = new Date(2026, parseInt(parts[1]) - 1, parseInt(parts[0]))
        } else continue
        if (isNaN(dateObj.getTime())) continue

        // Dedup by phone
        const phone = (row[5] || '').replace(/[^\d]/g, '')
        if (phone && seen.has(phone)) continue
        if (phone) seen.add(phone)

        // Qualification: em atendimento = qualificado, sem retorno/locação = desqualificado
        const statusLower = status.toLowerCase()
        let qualificacao
        if (statusLower.includes('atendimento')) qualificacao = 'QUALIFICADO'
        else if (statusLower.includes('sem retorno') || statusLower.includes('locação') || statusLower.includes('locacao')) qualificacao = 'DESQUALIFICADO'
        else qualificacao = 'DESQUALIFICADO'

        // Check if feedback mentions locação
        const feedbacks = ((row[7] || '') + ' ' + (row[8] || '')).toLowerCase()
        const isLocacao = feedbacks.includes('locação') || feedbacks.includes('locacao') || feedbacks.includes('locar') || feedbacks.includes('alug')
        if (isLocacao) qualificacao = 'DESQUALIFICADO'

        // Normalize imóvel name
        let imovel = (row[2] || '').trim()
        const imovelLower = imovel.toLowerCase()
        if (imovelLower.includes('berghem')) imovel = 'Res. Berghem'
        else if (imovelLower.includes('monte bello') || imovelLower.includes('monte belo')) imovel = 'Ed. Monte Bello'
        else if (imovelLower.includes('urussanguinha') || imovelLower.includes('casa uru')) imovel = 'Casa Urussanguinha'

        const origem = (row[6] || '').trim()
        const origemNorm = origem.toLowerCase().includes('instagram') ? 'Instagram' : origem.toLowerCase().includes('facebook') ? 'Facebook' : origem || 'Outro'

        allLeads.push({
          dateObj,
          nome,
          status: statusLower.includes('atendimento') ? 'Em Atendimento' : statusLower.includes('sem retorno') ? 'Sem Retorno' : status,
          qualificacao,
          imovel,
          origem: origemNorm,
          publico: (row[1] || '').trim(),
          feedbackCliente: (row[7] || '').trim(),
          feedbackCorretor: (row[8] || '').trim(),
          isLocacao,
        })
      }

      // Filter by date range
      const now = new Date()
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - days)
      cutoff.setHours(0, 0, 0, 0)
      const leads = allLeads.filter(l => l.dateObj >= cutoff)

      const prevCutoff = new Date(cutoff)
      prevCutoff.setDate(prevCutoff.getDate() - days)
      const prevLeads = allLeads.filter(l => l.dateObj >= prevCutoff && l.dateObj < cutoff)

      const total = leads.length
      const qualificados = leads.filter(l => l.qualificacao === 'QUALIFICADO').length
      const desqualificados = leads.filter(l => l.qualificacao === 'DESQUALIFICADO').length
      const emAtendimento = leads.filter(l => l.status === 'Em Atendimento').length
      const semRetorno = leads.filter(l => l.status === 'Sem Retorno').length
      const locacaoCount = leads.filter(l => l.isLocacao).length

      const prevTotal = prevLeads.length
      const prevQual = prevLeads.filter(l => l.qualificacao === 'QUALIFICADO').length
      const prevSemRet = prevLeads.filter(l => l.status === 'Sem Retorno').length

      // By origem
      const origemStats = {}
      leads.forEach(l => {
        if (!origemStats[l.origem]) origemStats[l.origem] = { total: 0, qualificado: 0, desqualificado: 0 }
        origemStats[l.origem].total++
        if (l.qualificacao === 'QUALIFICADO') origemStats[l.origem].qualificado++
        else origemStats[l.origem].desqualificado++
      })

      // By imovel
      const imovelStats = {}
      leads.forEach(l => {
        const im = l.imovel || 'Outro'
        if (!imovelStats[im]) imovelStats[im] = { total: 0, qualificado: 0, desqualificado: 0 }
        imovelStats[im].total++
        if (l.qualificacao === 'QUALIFICADO') imovelStats[im].qualificado++
        else imovelStats[im].desqualificado++
      })

      // Daily leads
      const dailyCounts = {}
      leads.forEach(l => {
        const day = l.dateObj.toISOString().slice(0, 10)
        if (!dailyCounts[day]) dailyCounts[day] = { date: day, count: 0 }
        dailyCounts[day].count++
      })
      const dailyLeads = Object.values(dailyCounts).sort((a, b) => a.date.localeCompare(b.date))

      return res.json({
        available: true,
        crmType: 'fernando',
        total,
        qualificados,
        desqualificados,
        emAtendimento,
        semRetorno,
        locacaoCount,
        qualRate: total > 0 ? ((qualificados / total) * 100).toFixed(1) : '0',
        semRetornoRate: total > 0 ? ((semRetorno / total) * 100).toFixed(1) : '0',
        previous: { total: prevTotal, qualificados: prevQual, semRetorno: prevSemRet },
        origemStats,
        imovelStats,
        dailyLeads,
      })
    }

    // BG Imóveis — "Leads Formulário" tab (Meta Lead Forms)
    if (config.type === 'bgimob') {
      const rows = await fetchSheetCSV(config.id, 'Leads Formulário')

      // Parse leads — skip header row and empty trailing rows
      // Columns: 0=id, 1=created_time, 2=ad_id, 3=ad_name, 4=adset_id, 5=adset_name,
      // 6=campaign_id, 7=campaign_name, 8=form_id, 9=form_name, 10=is_organic,
      // 11=platform, 12=interesse_terreno, 13=conhece_bg, 14=full_name, 15=phone,
      // 16=inbox_url, 17=lead_status, 18=CORRETOR, 19=STATUS
      const allLeads = []
      const seen = new Set()
      for (const row of rows) {
        if (row.length < 19) continue
        const id = (row[0] || '').trim()
        if (!id.startsWith('l:')) continue // skip header/summary rows

        const createdTime = row[1]
        let dateObj
        try {
          dateObj = new Date(createdTime)
          if (isNaN(dateObj.getTime())) continue
        } catch { continue }

        const phone = (row[15] || '').replace(/[^\d]/g, '')
        if (phone && seen.has(phone)) continue
        if (phone) seen.add(phone)

        const corretor = (row[18] || '').trim()
        // Normalize typos (e.g., "Dionatha" → "Dionathan")
        const corretorNorm = corretor.toLowerCase().startsWith('dionatha') ? 'Dionathan' : corretor

        allLeads.push({
          dateObj,
          adName: (row[3] || '').trim(),
          adsetName: (row[5] || '').trim(),
          campaignName: (row[7] || '').trim(),
          platform: (row[11] || '').trim(),
          interesseTerreno: (row[12] || '').trim().toLowerCase(),
          conheceBG: (row[13] || '').trim().toLowerCase(),
          nome: (row[14] || '').trim(),
          corretor: corretorNorm,
          status: (row[19] || '').trim().toUpperCase(),
        })
      }

      // Filter by date range
      const now = new Date()
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - days)
      cutoff.setHours(0, 0, 0, 0)
      const leads = allLeads.filter(l => l.dateObj >= cutoff)

      const prevCutoff = new Date(cutoff)
      prevCutoff.setDate(prevCutoff.getDate() - days)
      const prevLeads = allLeads.filter(l => l.dateObj >= prevCutoff && l.dateObj < cutoff)

      const total = leads.length

      // Status funnel
      const naoRespondeu = leads.filter(l => l.status === 'NÃO RESPONDEU').length
      const emAtendimento = leads.filter(l => l.status === 'EM ATENDIMENTO').length
      const visita = leads.filter(l => l.status === 'VISITA').length
      const proposta = leads.filter(l => l.status === 'PROPOSTA').length
      const comprou = leads.filter(l => l.status === 'COMPROU').length
      const semStatus = leads.filter(l => !l.status).length

      // Qualified = em atendimento + visita + proposta + comprou
      const qualificados = emAtendimento + visita + proposta + comprou

      // Previous period stats
      const prevTotal = prevLeads.length
      const prevQualificados = prevLeads.filter(l => ['EM ATENDIMENTO', 'VISITA', 'PROPOSTA', 'COMPROU'].includes(l.status)).length
      const prevNaoResp = prevLeads.filter(l => l.status === 'NÃO RESPONDEU').length

      // Per-corretor breakdown
      const corretorStats = {}
      leads.forEach(l => {
        const c = l.corretor || 'Sem corretor'
        if (!corretorStats[c]) corretorStats[c] = { total: 0, naoRespondeu: 0, emAtendimento: 0, visita: 0, proposta: 0, comprou: 0 }
        corretorStats[c].total++
        if (l.status === 'NÃO RESPONDEU') corretorStats[c].naoRespondeu++
        if (l.status === 'EM ATENDIMENTO') corretorStats[c].emAtendimento++
        if (l.status === 'VISITA') corretorStats[c].visita++
        if (l.status === 'PROPOSTA') corretorStats[c].proposta++
        if (l.status === 'COMPROU') corretorStats[c].comprou++
      })

      // Per-ad breakdown
      const adStats = {}
      leads.forEach(l => {
        const ad = l.adName || 'Sem anuncio'
        if (!adStats[ad]) adStats[ad] = { total: 0, qualificado: 0, naoResp: 0, visita: 0, proposta: 0, comprou: 0 }
        adStats[ad].total++
        if (['EM ATENDIMENTO', 'VISITA', 'PROPOSTA', 'COMPROU'].includes(l.status)) adStats[ad].qualificado++
        if (l.status === 'NÃO RESPONDEU') adStats[ad].naoResp++
        if (l.status === 'VISITA') adStats[ad].visita++
        if (l.status === 'PROPOSTA') adStats[ad].proposta++
        if (l.status === 'COMPROU') adStats[ad].comprou++
      })

      // Per-platform breakdown
      const platformStats = {}
      leads.forEach(l => {
        const p = l.platform === 'fb' ? 'Facebook' : l.platform === 'ig' ? 'Instagram' : l.platform || 'Outro'
        if (!platformStats[p]) platformStats[p] = { total: 0, qualificado: 0 }
        platformStats[p].total++
        if (['EM ATENDIMENTO', 'VISITA', 'PROPOSTA', 'COMPROU'].includes(l.status)) platformStats[p].qualificado++
      })

      // Conhece Balneário Gaivota breakdown
      const conheceBGStats = { sim: 0, nao: 0 }
      leads.forEach(l => {
        if (l.conheceBG === 'sim') conheceBGStats.sim++
        else if (l.conheceBG === 'não' || l.conheceBG === 'nao') conheceBGStats.nao++
      })

      // Daily leads
      const dailyCounts = {}
      leads.forEach(l => {
        const day = l.dateObj.toISOString().slice(0, 10)
        if (!dailyCounts[day]) dailyCounts[day] = { date: day, count: 0 }
        dailyCounts[day].count++
      })
      const dailyLeads = Object.values(dailyCounts).sort((a, b) => a.date.localeCompare(b.date))

      return res.json({
        available: true,
        crmType: 'bgimob',
        total,
        funnel: { naoRespondeu, emAtendimento, visita, proposta, comprou, semStatus },
        qualificados,
        qualRate: total > 0 ? ((qualificados / total) * 100).toFixed(1) : '0',
        naoRespRate: total > 0 ? ((naoRespondeu / total) * 100).toFixed(1) : '0',
        previous: { total: prevTotal, qualificados: prevQualificados, naoRespondeu: prevNaoResp },
        corretorStats,
        adStats,
        platformStats,
        conheceBGStats,
        dailyLeads,
      })
    }

    const sheetName = config.type === 'kellermann' ? 'ENTRADA DE LEADS' : 'LEADS'
    const rows = await fetchSheetCSV(config.id, sheetName)

    // Date range filter
    const now = new Date()
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - days)
    cutoff.setHours(0, 0, 0, 0)

    // Parse leads based on CRM type
    let allLeads
    if (config.type === 'sameco') {
      allLeads = parseSamecoLeads(rows)
    } else if (config.type === 'kellermann') {
      allLeads = await parseKellermannAllSheets(config.id)
    } else {
      // Invista format — 3 buckets: SIM (qualificado) / NÃO (desqualificado) / MEIO TERMO (sem qualificacao)
      allLeads = []
      const SKIP_NAMES = ['Nome', 'DEZEMBRO', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO']
      const VALID_ORIGENS = ['site - invistaimoveissm.com.br', 'facebook', 'instagram', 'whatsapp']
      // Qualificado: corretor NAO desqualifica E estado in whitelist
      const CORRETOR_DESQUAL = ['capao - claudia', 'capao da canoa', 'sem resposta', 'sem retorno', 'so informacao']
      const ESTADO_QUAL = ['em atendimento', 'em qualificacao', 'encaminhado ao setor', 'positiva', 'realmete transf']
      // Desqualificado: corretor IN list E estado IN list (AND)
      const ESTADO_DESQUAL = ['negatva', 'pausa temporariamente', 'sem evolucao', 'sem resposta']
      const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      for (const row of rows) {
        if (row.length < 8) continue
        const dateStr = row[0]
        const name = row[3]
        if (!dateStr || !name || SKIP_NAMES.includes(name) || dateStr === 'Data') continue
        const date = parseBRDate(dateStr)
        if (!date) continue
        const origem = (row[6] || '').trim()
        if (!VALID_ORIGENS.includes(origem.toLowerCase())) continue
        const corretor = (row[7] || '').trim()
        const estado = (row[11] || '').trim()
        const corretorNorm = stripAccents(corretor)
        const estadoNorm = stripAccents(estado)
        const corInDesq = !corretor || CORRETOR_DESQUAL.some(t => corretorNorm.includes(t))
        const estInQual = ESTADO_QUAL.some(t => estadoNorm.includes(t))
        const estInDesq = ESTADO_DESQUAL.some(t => estadoNorm.includes(t))
        let qualificacao = 'MEIO TERMO' // sem qualificacao
        if (!corInDesq && estInQual) qualificacao = 'SIM'
        else if (corInDesq && estInDesq) qualificacao = 'NÃO'
        allLeads.push({
          date: dateStr,
          dateObj: date,
          interesse: row[2],
          nome: name,
          origem,
          corretor,
          visita: row[8] || '',
          estado,
          qualificacao,
        })
      }
    }

    // Filter by date range
    const leads = allLeads.filter(l => l.dateObj >= cutoff)

    const total = leads.length

    // Helper to compute stats from a lead set
    function computeStats(set) {
      const emQualificacao = set.filter(l => l.estado.includes('Qualifica')).length
      const emAtendimento = set.filter(l => l.estado.includes('atendimento')).length
      const semResposta = set.filter(l => l.estado.includes('Sem resposta')).length
      const negativa = set.filter(l => l.estado.includes('Negat')).length
      const withVisit = set.filter(l => l.visita.trim().length > 0).length
      const visitScheduled = set.filter(l => l.visita.toLowerCase().includes('agendad')).length
      const visited = set.filter(l => l.visita.toLowerCase().includes('visitou')).length
      return { total: set.length, emQualificacao, emAtendimento, semResposta, negativa, withVisit, visitScheduled, visited }
    }

    const stats = computeStats(leads)

    // Source counts
    const sourceCounts = {}
    leads.forEach(l => { sourceCounts[l.origem || 'Sem origem'] = (sourceCounts[l.origem || 'Sem origem'] || 0) + 1 })

    // Interest counts (Venda vs Locação)
    const interestCounts = {}
    leads.forEach(l => { const k = l.interesse || 'Outro'; interestCounts[k] = (interestCounts[k] || 0) + 1 })

    // Agent counts
    const agentCounts = {}
    leads.forEach(l => { const k = l.corretor || 'Sem corretor'; agentCounts[k] = (agentCounts[k] || 0) + 1 })

    // Per-source breakdown (qualificação, visitas, etc by channel)
    const sourceBreakdown = {}
    for (const l of leads) {
      const src = l.origem || 'Sem origem'
      if (!sourceBreakdown[src]) sourceBreakdown[src] = []
      sourceBreakdown[src].push(l)
    }
    const perSource = Object.entries(sourceBreakdown)
      .filter(([k]) => k !== 'Sem origem' && k !== '')
      .map(([source, set]) => {
        const s = computeStats(set)
        const venda = set.filter(l => l.interesse === 'Venda').length
        const locacao = set.filter(l => l.interesse === 'Locação').length
        return {
          source: source.replace('Site - invistaimoveissm.com.br', 'Site'),
          total: s.total,
          emAtendimento: s.emAtendimento,
          semResposta: s.semResposta,
          visited: s.visited + s.visitScheduled,
          venda,
          locacao,
          qualRate: s.total > 0 ? ((s.emAtendimento / s.total) * 100).toFixed(1) : '0',
          visitRate: s.total > 0 ? (((s.visited + s.visitScheduled) / s.total) * 100).toFixed(1) : '0',
        }
      })
      .sort((a, b) => b.total - a.total)

    // Daily lead counts
    const dailyCounts = {}
    leads.forEach(l => { dailyCounts[l.date] = (dailyCounts[l.date] || 0) + 1 })
    const dailyLeads = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => {
        const da = parseBRDate(a.date), db = parseBRDate(b.date)
        return (da?.getTime() || 0) - (db?.getTime() || 0)
      })

    // Previous period for comparison
    const prevCutoff = new Date(cutoff)
    prevCutoff.setDate(prevCutoff.getDate() - days)
    const prevLeads = allLeads.filter(l => l.dateObj >= prevCutoff && l.dateObj < cutoff)
    const prevStats = computeStats(prevLeads)

    // Leads without assigned broker (alert)
    const semCorretor = leads.filter(l => !l.corretor || l.corretor.trim() === '' || l.corretor === 'Sem Retorno' || l.corretor === 'Sem resposta').length

    // Ads-sourced leads (Facebook + Instagram from CRM)
    const adsLeads = leads.filter(l => {
      const o = (l.origem || '').toLowerCase()
      return o.includes('facebook') || o.includes('instagram') || o.includes('meta')
    }).length

    // Funnel conversion rates
    const funnelRates = {
      leadToQualified: total > 0 ? ((stats.emQualificacao / total) * 100).toFixed(1) : '0',
      qualifiedToAtendimento: stats.emQualificacao > 0 ? ((stats.emAtendimento / stats.emQualificacao) * 100).toFixed(1) : '0',
      atendimentoToVisit: stats.emAtendimento > 0 ? (((stats.visitScheduled + stats.visited) / stats.emAtendimento) * 100).toFixed(1) : '0',
    }

    // Sameco-specific: tipo (Residência/Empresa) and faixa energia
    const tipoCounts = {}
    const faixaCounts = {}
    leads.forEach(l => {
      if (l.tipo) tipoCounts[l.tipo] = (tipoCounts[l.tipo] || 0) + 1
      if (l.faixaEnergia) faixaCounts[l.faixaEnergia] = (faixaCounts[l.faixaEnergia] || 0) + 1
    })

    // Qualificação stats
    // Kellermann: qualificacao = SIM/NÃO/MEIO TERMO
    // Sameco: qualificacao = QUALIFICADO/DESQUALIFICADO/EM ATENDIMENTO/VENDIDO (from color-coded column Y)
    const semRetorno = leads.filter(l => l.estado.toLowerCase().includes('sem retorno')).length
    let qualSim, qualNao, qualMeio, qualVendido, qualEmAtendimento
    if (config.type === 'sameco') {
      qualSim = leads.filter(l => l.qualificacao === 'SIM').length
      qualNao = leads.filter(l => l.qualificacao === 'NÃO' || l.qualificacao === 'NAO').length
      qualEmAtendimento = leads.filter(l => l.qualificacao === 'EM ATENDIMENTO').length
      qualVendido = leads.filter(l => l.qualificacao === 'VENDEU').length
      // Sem qualificacao = leads ainda nao avaliados (vazio ou outros estados)
      qualMeio = leads.filter(l => !['SIM', 'NÃO', 'VENDEU'].includes(l.qualificacao)).length
    } else {
      qualSim = leads.filter(l => l.qualificacao === 'SIM').length
      qualNao = leads.filter(l => l.qualificacao === 'NÃO').length
      qualMeio = leads.filter(l => l.qualificacao === 'MEIO TERMO').length
      qualVendido = 0
      qualEmAtendimento = 0
    }
    const qualifiedTotal = qualSim + qualMeio
    const generalQualRate = total > 0 ? ((qualSim / total) * 100).toFixed(1) : '0'

    // Per-agent qualificação
    const agentQual = {}
    leads.forEach(l => {
      const agent = l.corretor || 'Sem corretor'
      if (!agentQual[agent]) agentQual[agent] = { total: 0, sim: 0, nao: 0, meio: 0, semRetorno: 0 }
      agentQual[agent].total++
      if (config.type === 'sameco') {
        if (l.qualificacao === 'SIM') agentQual[agent].sim++
        else if (l.qualificacao === 'NÃO' || l.qualificacao === 'NAO') agentQual[agent].nao++
        else if (l.qualificacao === 'EM ATENDIMENTO') agentQual[agent].meio++
      } else {
        if (l.qualificacao === 'SIM') agentQual[agent].sim++
        else if (l.qualificacao === 'NÃO') agentQual[agent].nao++
        else if (l.qualificacao === 'MEIO TERMO') agentQual[agent].meio++
      }
      if (l.estado.toLowerCase().includes('sem retorno')) agentQual[agent].semRetorno++
    })

    // Per-source qualificação
    const sourceQual = {}
    leads.forEach(l => {
      const src = l.origem || 'Sem origem'
      if (!sourceQual[src]) sourceQual[src] = { total: 0, sim: 0, nao: 0, meio: 0, semRetorno: 0, vendido: 0 }
      sourceQual[src].total++
      if (config.type === 'sameco') {
        if (l.qualificacao === 'SIM') sourceQual[src].sim++
        else if (l.qualificacao === 'NÃO' || l.qualificacao === 'NAO') sourceQual[src].nao++
        else if (l.qualificacao === 'EM ATENDIMENTO') sourceQual[src].meio++
        else if (l.qualificacao === 'VENDEU') sourceQual[src].vendido++
      } else {
        if (l.qualificacao === 'SIM') sourceQual[src].sim++
        else if (l.qualificacao === 'NÃO') sourceQual[src].nao++
        else if (l.qualificacao === 'MEIO TERMO') sourceQual[src].meio++
      }
      if (l.estado.toLowerCase().includes('sem retorno')) sourceQual[src].semRetorno++
    })

    res.json({
      available: true,
      crmType: config.type,
      total,
      funnel: {
        emQualificacao: stats.emQualificacao,
        emAtendimento: stats.emAtendimento,
        semResposta: stats.semResposta,
        negativa: stats.negativa,
        visitScheduled: stats.visitScheduled,
        visited: stats.visited,
      },
      funnelRates,
      previous: {
        total: prevLeads.length,
        emAtendimento: prevStats.emAtendimento,
        semResposta: prevStats.semResposta,
        visited: prevStats.visited + prevStats.visitScheduled,
      },
      sourceCounts,
      interestCounts,
      agentCounts,
      perSource,
      dailyLeads,
      adsLeads,
      semCorretor,
      semRetorno,
      qualified: qualifiedTotal,
      qualSim,
      qualNao,
      qualMeio,
      qualVendido: qualVendido || 0,
      qualEmAtendimento: qualEmAtendimento || 0,
      agentQual,
      sourceQual,
      generalQualRate,
      tipoCounts,
      faixaCounts,
      visitRate: total > 0 ? (((stats.withVisit) / total) * 100).toFixed(1) : '0',
      qualificationRate: total > 0 ? ((stats.emAtendimento / total) * 100).toFixed(1) : '0',
      noResponseRate: total > 0 ? ((stats.semResposta / total) * 100).toFixed(1) : '0',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Also fetch form leads
app.get('/api/crm/:accountId/forms', auth, async (req, res) => {
  try {
    const accountName = req.query.name || ''
    const config = getCRMConfig(accountName)
    if (!config) return res.json({ available: false })
    const sheetId = config.id

    const [formLeads, formFeiraoLeads] = await Promise.all([
      fetchSheetCSV(sheetId, 'Leads Formulário').catch(() => []),
      fetchSheetCSV(sheetId, 'Leads Formulário Feirão').catch(() => []),
    ])

    const parseFormRows = (rows) => {
      if (rows.length < 2) return []
      const headers = rows[0]
      return rows.slice(1).filter(r => r.length > 5 && r[0]).map(r => ({
        id: r[0],
        date: r[1],
        adName: r[3],
        campaignName: r[7],
        platform: r[11],
        name: r[headers.length - 3] || r[14],
        phone: r[headers.length - 2] || r[15],
        status: r[headers.length - 1] || r[16],
      }))
    }

    res.json({
      available: true,
      formLeads: parseFormRows(formLeads),
      formFeiraoLeads: parseFormRows(formFeiraoLeads),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// CAMPAIGNS (Meta)
// =============================================

// Campaigns list
app.get('/api/meta/accounts/:accountId/campaigns', auth, async (req, res) => {
  try {
    const { accountId } = req.params
    const data = await metaFetch(`/${accountId}/campaigns`, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,effective_status,start_time,created_time',
      limit: '100',
    })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Adsets of a campaign — com insights do periodo (spend, actions, etc)
app.get('/api/meta/campaigns/:campaignId/adsets', auth, async (req, res) => {
  try {
    const { campaignId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const insightsField = `insights.time_range(${JSON.stringify(ranges.current)}){spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type}`

    const data = await metaFetch(`/${campaignId}/adsets`, {
      fields: `id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,${insightsField}`,
      limit: '100',
    })

    // Flatten insights[0] into adset itself
    const adsets = (data.data || []).map(a => ({
      ...a,
      insight: (a.insights && a.insights.data && a.insights.data[0]) || null,
      insights: undefined,
    }))

    res.json({ data: adsets, ranges })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Ads of an adset — com insights + creative (thumbnail)
app.get('/api/meta/adsets/:adsetId/ads', auth, async (req, res) => {
  try {
    const { adsetId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const insightsField = `insights.time_range(${JSON.stringify(ranges.current)}){spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type}`
    const creativeField = 'creative{id,name,thumbnail_url,image_url,video_id,effective_object_story_id,object_story_spec,body,title,call_to_action_type}'

    const data = await metaFetch(`/${adsetId}/ads`, {
      fields: `id,name,status,effective_status,${creativeField},${insightsField}`,
      limit: '100',
    })

    const ads = (data.data || []).map(a => ({
      ...a,
      insight: (a.insights && a.insights.data && a.insights.data[0]) || null,
      insights: undefined,
    }))

    res.json({ data: ads, ranges })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Top ads da conta — todos os ads com insights + creative pra selecionar top N no frontend
app.get('/api/meta/accounts/:accountId/top-ads', auth, async (req, res) => {
  try {
    const { accountId } = req.params
    const { days = '30', since, until, limit = '200' } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const insightsField = `insights.time_range(${JSON.stringify(ranges.current)}){spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type}`
    const creativeField = 'creative{id,name,thumbnail_url,image_url,video_id,effective_object_story_id,body,title,call_to_action_type}'

    const data = await metaFetch(`/${accountId}/ads`, {
      fields: `id,name,status,effective_status,campaign_id,adset_id,${creativeField},${insightsField}`,
      filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE','PAUSED','ADSET_PAUSED','CAMPAIGN_PAUSED'] }]),
      limit: String(limit),
    })

    const ads = (data.data || []).map(a => ({
      ...a,
      insight: (a.insights && a.insights.data && a.insights.data[0]) || null,
      insights: undefined,
    })).filter(a => a.insight && parseFloat(a.insight.spend || '0') > 0)  // so ads que tiveram gasto no periodo

    res.json({ data: ads, ranges })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Lista action_types unicos que apareceram nas ads da conta (nos snapshots dos ultimos 90d)
// Usado no picker de "quais eventos contam como conversao" pra essa conta.
app.get('/api/meta/accounts/:accountId/action-types', auth, (req, res) => {
  try {
    const { accountId } = req.params
    // Pega snapshots dos ultimos 90 dias e coleta action_types unicos com contagem
    const end = new Date(); end.setDate(end.getDate() - 1)
    const start = new Date(end); start.setDate(start.getDate() - 90)
    const since = fmtDate(start), until = fmtDate(end)

    const allSnaps = agg.getAllAdInsights(accountId, since, until)
    const counts = new Map()
    for (const ins of allSnaps) {
      if (!ins.actions) continue
      for (const a of ins.actions) {
        const prev = counts.get(a.action_type) || 0
        counts.set(a.action_type, prev + parseFloat(a.value || 0))
      }
    }

    // Ordena por volume, retorna top 100
    const sorted = Array.from(counts.entries())
      .map(([action_type, total]) => ({ action_type, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 100)

    res.json({ action_types: sorted })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Preview HTML de um ad — retorna iframe pronto do Meta
// Formatos: DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD, INSTAGRAM_STANDARD, INSTAGRAM_STORY, INSTAGRAM_REELS
app.get('/api/meta/ads/:adId/preview', auth, async (req, res) => {
  try {
    const { adId } = req.params
    const format = req.query.format || 'DESKTOP_FEED_STANDARD'

    const data = await metaFetch(`/${adId}/previews`, { ad_format: format })
    const html = (data.data && data.data[0] && data.data[0].body) || ''
    res.json({ html, format })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// GOOGLE ADS API
// =============================================

// Usa getters pra refletir mudancas dos `let` em runtime (atualizados por syncFromHub).
const GADS = {
  get devToken() { return GOOGLE_ADS_DEVELOPER_TOKEN },
  get clientId() { return GOOGLE_ADS_CLIENT_ID },
  get clientSecret() { return GOOGLE_ADS_CLIENT_SECRET },
  get refreshToken() { return GOOGLE_ADS_REFRESH_TOKEN },
  get loginCustomerId() { return (GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '') },
  redirectUri: process.env.GADS_REDIRECT_URI || `http://localhost:${PORT}/api/google-ads/callback`,
}

const GADS_API = 'https://googleads.googleapis.com/v20'

// Token cache
let gadsTokenCache = { token: null, expiresAt: 0 }

async function getGadsAccessToken() {
  if (gadsTokenCache.token && Date.now() < gadsTokenCache.expiresAt) return gadsTokenCache.token
  if (!GADS.refreshToken) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: GADS.refreshToken,
      client_id: GADS.clientId,
      client_secret: GADS.clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Google OAuth error: ${data.error_description || data.error}`)
  gadsTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return gadsTokenCache.token
}

async function gaqlQuery(customerId, query) {
  const token = await getGadsAccessToken()
  const res = await fetch(`${GADS_API}/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'developer-token': GADS.devToken,
      'login-customer-id': GADS.loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(JSON.stringify(err.error?.message || err))
  }
  const batches = await res.json()
  return batches.flatMap(batch => batch.results || [])
}

// Step 1: OAuth start — visit this URL in browser to authorize
app.get('/api/google-ads/auth', (req, res) => {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', GADS.clientId)
  url.searchParams.set('redirect_uri', GADS.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/analytics.readonly')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  res.redirect(url.toString())
})

// Step 2: OAuth callback — saves refresh token
app.get('/api/google-ads/callback', async (req, res) => {
  try {
    const { code } = req.query
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GADS.clientId,
        client_secret: GADS.clientSecret,
        redirect_uri: GADS.redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (tokens.error) return res.status(400).json(tokens)

    // Show the refresh token to save in .env
    res.send(`
      <h2>Google Ads OAuth - Sucesso!</h2>
      <p>Adicione esta linha no seu <b>.env</b>:</p>
      <pre style="background:#111;color:#0f0;padding:20px;border-radius:8px;font-size:16px;">GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}</pre>
      <p>Depois reinicie o servidor.</p>
    `)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// List Google Ads accounts (from MCC sub-accounts)
app.get('/api/google-ads/accounts', auth, async (req, res) => {
  try {
    const token = await getGadsAccessToken()
    if (!token) return res.json({ accounts: [], error: 'No refresh token. Visit /api/google-ads/auth first.' })

    // Query MCC for all non-manager client accounts
    const results = await gaqlQuery(GADS.loginCustomerId, `
      SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code,
             customer_client.manager, customer_client.status
      FROM customer_client
      WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'
    `)

    const accounts = results.map(r => ({
      id: String(r.customerClient.id),
      name: r.customerClient.descriptiveName || '',
      currency: r.customerClient.currencyCode || 'BRL',
      status: r.customerClient.status,
    }))

    res.json({ accounts })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Google Ads campaign performance (with Quality Score, Impression Share, period comparison)
app.get('/api/google-ads/:customerId/campaigns', auth, cacheMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    function parseCampaigns(results) {
      return results.map(r => ({
        id: r.campaign.id,
        name: r.campaign.name,
        status: r.campaign.status,
        type: r.campaign.advertisingChannelType,
        impressions: parseInt(r.metrics.impressions || 0),
        clicks: parseInt(r.metrics.clicks || 0),
        ctr: parseFloat(r.metrics.ctr || 0) * 100,
        cpc: parseInt(r.metrics.averageCpc || 0) / 1000000,
        spend: parseInt(r.metrics.costMicros || 0) / 1000000,
        conversions: parseFloat(r.metrics.conversions || 0),
        revenue: parseFloat(r.metrics.conversionsValue || 0),
        cpa: parseInt(r.metrics.costPerConversion || 0) / 1000000,
        convRate: parseFloat(r.metrics.conversionsFromInteractionsRate || 0) * 100,
        impressionShare: parseFloat(r.metrics.searchImpressionShare || 0) * 100,
        topImprShare: parseFloat(r.metrics.searchTopImpressionShare || 0) * 100,
        absTopImprShare: parseFloat(r.metrics.searchAbsoluteTopImpressionShare || 0) * 100,
      }))
    }

    function calcTotals(campaigns) {
      const t = campaigns.reduce((t, c) => ({
        spend: t.spend + c.spend, impressions: t.impressions + c.impressions,
        clicks: t.clicks + c.clicks, conversions: t.conversions + c.conversions,
        revenue: t.revenue + c.revenue,
      }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 })
      t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0
      t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0
      t.cpa = t.conversions > 0 ? t.spend / t.conversions : 0
      t.roas = t.spend > 0 ? t.revenue / t.spend : 0
      t.convRate = t.clicks > 0 ? (t.conversions / t.clicks) * 100 : 0
      return t
    }

    const campaignQuery = `
      SELECT
        campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.cost_per_conversion, metrics.conversions_from_interactions_rate,
        metrics.search_impression_share, metrics.search_top_impression_share,
        metrics.search_absolute_top_impression_share
      FROM campaign
      WHERE segments.date BETWEEN '%SINCE%' AND '%UNTIL%'
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `

    const [currentResults, prevResults] = await Promise.all([
      gaqlQuery(customerId, campaignQuery.replace('%SINCE%', ranges.current.since).replace('%UNTIL%', ranges.current.until)).catch(() => []),
      gaqlQuery(customerId, campaignQuery.replace('%SINCE%', ranges.previous.since).replace('%UNTIL%', ranges.previous.until)).catch(() => []),
    ])

    const campaigns = parseCampaigns(currentResults)
    const totals = calcTotals(campaigns)
    const prevTotals = calcTotals(parseCampaigns(prevResults))

    // Avg Quality Score from keywords
    const qsResults = await gaqlQuery(customerId, `
      SELECT ad_group_criterion.quality_info.quality_score
      FROM keyword_view
      WHERE ad_group_criterion.quality_info.quality_score > 0
      LIMIT 500
    `).catch(() => [])
    const qsScores = qsResults.map(r => r.adGroupCriterion?.qualityInfo?.qualityScore).filter(Boolean)
    totals.avgQualityScore = qsScores.length > 0 ? qsScores.reduce((a, b) => a + b, 0) / qsScores.length : null

    res.json({ campaigns, totals, prevTotals, ranges })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Google Ads daily performance (with conversions + previous period)
app.get('/api/google-ads/:customerId/daily', auth, cacheMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const dailyQuery = `
      SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '%SINCE%' AND '%UNTIL%'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date ASC
    `

    function aggregateDaily(results) {
      const byDate = {}
      results.forEach(r => {
        const d = r.segments.date
        if (!byDate[d]) byDate[d] = { date: d, spend: 0, clicks: 0, impressions: 0, conversions: 0 }
        byDate[d].spend += parseInt(r.metrics.costMicros || 0) / 1000000
        byDate[d].clicks += parseInt(r.metrics.clicks || 0)
        byDate[d].impressions += parseInt(r.metrics.impressions || 0)
        byDate[d].conversions += parseFloat(r.metrics.conversions || 0)
      })
      return Object.values(byDate)
    }

    const [curResults, prevResults] = await Promise.all([
      gaqlQuery(customerId, dailyQuery.replace('%SINCE%', ranges.current.since).replace('%UNTIL%', ranges.current.until)).catch(() => []),
      gaqlQuery(customerId, dailyQuery.replace('%SINCE%', ranges.previous.since).replace('%UNTIL%', ranges.previous.until)).catch(() => []),
    ])

    res.json({ daily: aggregateDaily(curResults), prevDaily: aggregateDaily(prevResults), ranges })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Google Ads keyword performance
app.get('/api/google-ads/:customerId/keywords', auth, cacheMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const results = await gaqlQuery(customerId, `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.quality_info.quality_score,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.average_cpc, metrics.ctr
      FROM keyword_view
      WHERE segments.date BETWEEN '${ranges.current.since}' AND '${ranges.current.until}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 50
    `)

    const keywords = results.map(r => ({
      keyword: r.adGroupCriterion?.keyword?.text || '',
      matchType: r.adGroupCriterion?.keyword?.matchType || '',
      qualityScore: r.adGroupCriterion?.qualityInfo?.qualityScore || null,
      impressions: parseInt(r.metrics.impressions || 0),
      clicks: parseInt(r.metrics.clicks || 0),
      ctr: parseFloat(r.metrics.ctr || 0) * 100,
      cpc: parseInt(r.metrics.averageCpc || 0) / 1000000,
      spend: parseInt(r.metrics.costMicros || 0) / 1000000,
      conversions: parseFloat(r.metrics.conversions || 0),
    }))

    res.json({ keywords })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Google Ads search terms report
app.get('/api/google-ads/:customerId/search-terms', auth, cacheMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const results = await gaqlQuery(customerId, `
      SELECT
        search_term_view.search_term,
        campaign.name,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.ctr, metrics.average_cpc
      FROM search_term_view
      WHERE segments.date BETWEEN '${ranges.current.since}' AND '${ranges.current.until}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 30
    `)

    const searchTerms = results.map(r => ({
      term: r.searchTermView?.searchTerm || '',
      campaign: r.campaign?.name || '',
      impressions: parseInt(r.metrics.impressions || 0),
      clicks: parseInt(r.metrics.clicks || 0),
      ctr: parseFloat(r.metrics.ctr || 0) * 100,
      cpc: parseInt(r.metrics.averageCpc || 0) / 1000000,
      spend: parseInt(r.metrics.costMicros || 0) / 1000000,
      conversions: parseFloat(r.metrics.conversions || 0),
    }))

    res.json({ searchTerms })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Google Ads device performance
app.get('/api/google-ads/:customerId/devices', auth, cacheMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const results = await gaqlQuery(customerId, `
      SELECT
        segments.device,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value, metrics.ctr,
        metrics.average_cpc, metrics.conversions_from_interactions_rate
      FROM campaign
      WHERE segments.date BETWEEN '${ranges.current.since}' AND '${ranges.current.until}'
        AND campaign.status != 'REMOVED'
    `)

    const byDevice = {}
    results.forEach(r => {
      const dev = r.segments.device || 'OTHER'
      if (!byDevice[dev]) byDevice[dev] = { device: dev, impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 }
      byDevice[dev].impressions += parseInt(r.metrics.impressions || 0)
      byDevice[dev].clicks += parseInt(r.metrics.clicks || 0)
      byDevice[dev].spend += parseInt(r.metrics.costMicros || 0) / 1000000
      byDevice[dev].conversions += parseFloat(r.metrics.conversions || 0)
      byDevice[dev].revenue += parseFloat(r.metrics.conversionsValue || 0)
    })

    // Calculate rates
    const devices = Object.values(byDevice).map(d => ({
      ...d,
      ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
      convRate: d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0,
      cpa: d.conversions > 0 ? d.spend / d.conversions : 0,
    })).sort((a, b) => b.spend - a.spend)

    res.json({ devices })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Google Ads hour-of-day performance
app.get('/api/google-ads/:customerId/hourly', auth, cacheMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const results = await gaqlQuery(customerId, `
      SELECT
        segments.hour,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE segments.date BETWEEN '${ranges.current.since}' AND '${ranges.current.until}'
        AND campaign.status != 'REMOVED'
    `)

    const byHour = {}
    for (let h = 0; h < 24; h++) byHour[h] = { hour: h, impressions: 0, clicks: 0, spend: 0, conversions: 0 }

    results.forEach(r => {
      const h = parseInt(r.segments.hour)
      if (byHour[h] !== undefined) {
        byHour[h].impressions += parseInt(r.metrics.impressions || 0)
        byHour[h].clicks += parseInt(r.metrics.clicks || 0)
        byHour[h].spend += parseInt(r.metrics.costMicros || 0) / 1000000
        byHour[h].conversions += parseFloat(r.metrics.conversions || 0)
      }
    })

    const hourly = Object.values(byHour).map(h => ({
      ...h,
      ctr: h.impressions > 0 ? (h.clicks / h.impressions) * 100 : 0,
      cpc: h.clicks > 0 ? h.spend / h.clicks : 0,
    }))

    res.json({ hourly })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Lista conversion actions configuradas no Google Ads (pro picker do Overview)
// Retorna id + name + category — leve, so pra popular checkboxes.
app.get('/api/google-ads/:customerId/conversion-actions', auth, cacheMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params
    const results = await gaqlQuery(customerId, `
      SELECT conversion_action.id, conversion_action.name, conversion_action.category,
             conversion_action.status, conversion_action.type
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
      LIMIT 200
    `)
    const actions = results.map(r => ({
      id: r.conversionAction?.id || '',
      name: r.conversionAction?.name || '',
      category: r.conversionAction?.category || '',
      type: r.conversionAction?.type || '',
    })).filter(a => a.id)
    res.json({ actions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Google Ads conversion actions breakdown
app.get('/api/google-ads/:customerId/conversions', auth, cacheMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params
    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const results = await gaqlQuery(customerId, `
      SELECT
        segments.conversion_action_name,
        segments.conversion_action_category,
        metrics.conversions, metrics.conversions_value, metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date BETWEEN '${ranges.current.since}' AND '${ranges.current.until}'
        AND campaign.status != 'REMOVED'
        AND metrics.conversions > 0
    `)

    const byAction = {}
    results.forEach(r => {
      const name = r.segments.conversionActionName || 'Desconhecido'
      const category = r.segments.conversionActionCategory || ''
      if (!byAction[name]) byAction[name] = { name, category, conversions: 0, value: 0, cost: 0 }
      byAction[name].conversions += parseFloat(r.metrics.conversions || 0)
      byAction[name].value += parseFloat(r.metrics.conversionsValue || 0)
      byAction[name].cost += parseFloat(r.metrics.costPerConversion || 0)
    })

    const actions = Object.values(byAction)
      .map(a => ({ ...a, conversions: Math.round(a.conversions) }))
      .sort((a, b) => b.conversions - a.conversions)

    res.json({ actions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// GOOGLE ANALYTICS 4 (GA4)
// =============================================

const GA4_API = 'https://analyticsdata.googleapis.com/v1beta'

// GA4 property mappings per client (name pattern -> property IDs)
const GA4_PROPERTIES = {
  'josi': [{ id: '519645048', name: 'Josi Terapeuta' }],
  'josiane': [{ id: '519645048', name: 'Josi Terapeuta' }],
  'quimiprol': [{ id: '250518836', name: 'Quimiprol (.ind.br)' }, { id: '371238748', name: 'Quimiprol (.com.br)' }],
  'renove': [{ id: '453421508', name: 'Renove Imoveis' }],
  'door grill': [{ id: '353288580', name: 'Door Grill LP' }, { id: '346421460', name: 'Door Grill Nuvemshop' }, { id: '299944361', name: 'DoorGrill Projetos' }],
  'doorgrill': [{ id: '353288580', name: 'Door Grill LP' }, { id: '346421460', name: 'Door Grill Nuvemshop' }, { id: '299944361', name: 'DoorGrill Projetos' }],
  'gui auto': [{ id: '521274503', name: 'Gui AutoCar' }],
  'autocar': [{ id: '521274503', name: 'Gui AutoCar' }],
  'ask': [{ id: '347935844', name: 'ASK Equipamentos' }],
}

function getGA4Properties(accountName) {
  const lower = accountName.toLowerCase()
  const cleaned = lower.replace(/^(ca\s*-?\s*|[\d]+\s*-\s*)/i, '').trim()
  const words = cleaned.split(/[\s\-]+/).filter(w => w.length >= 3)
  for (const [pattern, props] of Object.entries(GA4_PROPERTIES)) {
    if (words.some(w => pattern.includes(w)) || lower.includes(pattern)) return props
  }
  return null
}

async function getGoogleAccessToken() {
  // Reuse Google Ads token (same OAuth credentials + refresh token)
  return getGadsAccessToken()
}

async function ga4Report(propertyId, body, accessToken) {
  const res = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`GA4 error ${res.status}: ${err.error?.message || JSON.stringify(err)}`)
  }
  return res.json()
}

// Get GA4 properties for a client
app.get('/api/analytics/properties', auth, (req, res) => {
  const name = req.query.name || ''
  const props = getGA4Properties(name)
  if (!props) return res.json({ available: false, properties: [] })
  res.json({ available: true, properties: props })
})

// GA4 main report (KPIs + comparison + daily + sources + pages + devices)
app.get('/api/analytics/:propertyId/report', auth, cacheMiddleware, async (req, res) => {
  try {
    const { propertyId } = req.params
    const { days = '7', since, until } = req.query
    const d = parseInt(days)
    const token = await getGoogleAccessToken()
    if (!token) return res.status(500).json({ error: 'No Google token' })

    // Date ranges
    let startDate, endDate, prevStartDate, prevEndDate
    if (since && until) {
      startDate = since
      endDate = until
      const diffDays = Math.ceil((new Date(until) - new Date(since)) / 86400000) + 1
      const prevEnd = new Date(since)
      prevEnd.setDate(prevEnd.getDate() - 1)
      const prevStart = new Date(prevEnd)
      prevStart.setDate(prevStart.getDate() - diffDays + 1)
      prevStartDate = fmtDate(prevStart)
      prevEndDate = fmtDate(prevEnd)
    } else {
      endDate = 'yesterday'
      startDate = `${d}daysAgo`
      prevEndDate = `${d + 1}daysAgo`
      prevStartDate = `${d * 2}daysAgo`
    }

    // 1. KPIs with comparison
    const [kpiData, dailyData, sourceData, pageData, deviceData, sourceMediumData, landingData, newRetData, eventsData, dowData, cityData] = await Promise.all([
      // KPIs: current + previous
      ga4Report(propertyId, {
        dateRanges: [
          { startDate, endDate },
          { startDate: prevStartDate, endDate: prevEndDate },
        ],
        metrics: [
          { name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' },
          { name: 'screenPageViews' }, { name: 'averageSessionDuration' },
          { name: 'bounceRate' }, { name: 'engagedSessions' },
          { name: 'conversions' }, { name: 'eventCount' },
        ],
      }, token),

      // Daily sessions
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'conversions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }, token),

      // Traffic sources
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }, { name: 'engagedSessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '10',
      }, token),

      // Top pages
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: '15',
      }, token),

      // Devices
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }, token),

      // Source/Medium detail
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionSourceMedium' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'engagementRate' }, { name: 'conversions' }, { name: 'bounceRate' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '15',
      }, token).catch(() => ({ rows: [] })),

      // Landing pages
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'landingPage' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagementRate' }, { name: 'bounceRate' }, { name: 'conversions' }, { name: 'averageSessionDuration' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '15',
      }, token).catch(() => ({ rows: [] })),

      // New vs Returning
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'newVsReturning' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagementRate' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }, { name: 'conversions' }, { name: 'screenPageViews' }],
      }, token).catch(() => ({ rows: [] })),

      // Top events (micro-conversions)
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: '20',
      }, token).catch(() => ({ rows: [] })),

      // Day of week
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'dayOfWeekName' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }, { name: 'engagementRate' }],
      }, token).catch(() => ({ rows: [] })),

      // Cities
      ga4Report(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'city' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '15',
      }, token).catch(() => ({ rows: [] })),
    ])

    // Parse KPIs
    function parseMetricRow(row) {
      const vals = row?.metricValues || []
      return {
        sessions: parseInt(vals[0]?.value || 0),
        users: parseInt(vals[1]?.value || 0),
        newUsers: parseInt(vals[2]?.value || 0),
        pageviews: parseInt(vals[3]?.value || 0),
        avgDuration: parseFloat(vals[4]?.value || 0),
        bounceRate: parseFloat(vals[5]?.value || 0) * 100,
        engagedSessions: parseInt(vals[6]?.value || 0),
        conversions: parseInt(vals[7]?.value || 0),
        events: parseInt(vals[8]?.value || 0),
      }
    }
    const current = parseMetricRow(kpiData.rows?.[0])
    const previous = parseMetricRow(kpiData.rows?.[1])
    current.engagementRate = current.sessions > 0 ? (current.engagedSessions / current.sessions) * 100 : 0
    previous.engagementRate = previous.sessions > 0 ? (previous.engagedSessions / previous.sessions) * 100 : 0
    current.pagesPerSession = current.sessions > 0 ? current.pageviews / current.sessions : 0
    previous.pagesPerSession = previous.sessions > 0 ? previous.pageviews / previous.sessions : 0

    // Parse daily
    const daily = (dailyData.rows || []).map(r => ({
      date: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
      pageviews: parseInt(r.metricValues[2].value || 0),
      conversions: parseInt(r.metricValues[3].value || 0),
    }))

    // Parse sources (channel groups)
    const sources = (sourceData.rows || []).map(r => ({
      channel: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
      conversions: parseInt(r.metricValues[2].value || 0),
      engaged: parseInt(r.metricValues[3].value || 0),
    }))

    // Parse pages
    const pages = (pageData.rows || []).map(r => ({
      path: r.dimensionValues[0].value,
      pageviews: parseInt(r.metricValues[0].value || 0),
      sessions: parseInt(r.metricValues[1].value || 0),
      avgDuration: parseFloat(r.metricValues[2].value || 0),
      bounceRate: parseFloat(r.metricValues[3].value || 0) * 100,
    }))

    // Parse devices
    const devices = (deviceData.rows || []).map(r => ({
      device: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
      conversions: parseInt(r.metricValues[2].value || 0),
      bounceRate: parseFloat(r.metricValues[3].value || 0) * 100,
      avgDuration: parseFloat(r.metricValues[4].value || 0),
    }))

    // Parse source/medium
    const sourceMedium = (sourceMediumData.rows || []).map(r => ({
      sourceMedium: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
      newUsers: parseInt(r.metricValues[2].value || 0),
      engagementRate: parseFloat(r.metricValues[3].value || 0) * 100,
      conversions: parseInt(r.metricValues[4].value || 0),
      bounceRate: parseFloat(r.metricValues[5].value || 0) * 100,
    }))

    // Parse landing pages
    const landingPages = (landingData.rows || []).map(r => ({
      page: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
      engagementRate: parseFloat(r.metricValues[2].value || 0) * 100,
      bounceRate: parseFloat(r.metricValues[3].value || 0) * 100,
      conversions: parseInt(r.metricValues[4].value || 0),
      avgDuration: parseFloat(r.metricValues[5].value || 0),
    }))

    // Parse new vs returning
    const newVsReturning = (newRetData.rows || []).map(r => ({
      type: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
      engagementRate: parseFloat(r.metricValues[2].value || 0) * 100,
      bounceRate: parseFloat(r.metricValues[3].value || 0) * 100,
      avgDuration: parseFloat(r.metricValues[4].value || 0),
      conversions: parseInt(r.metricValues[5].value || 0),
      pageviews: parseInt(r.metricValues[6].value || 0),
    }))

    // Parse events
    const events = (eventsData.rows || []).map(r => ({
      name: r.dimensionValues[0].value,
      count: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
    })).filter(e => !['session_start', 'first_visit', 'user_engagement'].includes(e.name))

    // Parse day of week
    const DAY_ORDER = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
    const dayOfWeek = (dowData.rows || []).map(r => ({
      day: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
      conversions: parseInt(r.metricValues[2].value || 0),
      engagementRate: parseFloat(r.metricValues[3].value || 0) * 100,
    })).sort((a, b) => (DAY_ORDER[a.day] ?? 7) - (DAY_ORDER[b.day] ?? 7))

    // Parse cities
    const cities = (cityData.rows || []).map(r => ({
      city: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
      conversions: parseInt(r.metricValues[2].value || 0),
    })).filter(c => c.city && c.city !== '(not set)')

    res.json({ current, previous, daily, sources, pages, devices, sourceMedium, landingPages, newVsReturning, events, dayOfWeek, cities })
  } catch (err) {
    console.error('[GA4]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// KIWIFY API
// =============================================

const KIWIFY_API = 'https://public-api.kiwify.com'

// Token cache for Kiwify OAuth
let kiwifyTokenCache = { token: null, expiresAt: 0 }

async function getKiwifyToken() {
  if (kiwifyTokenCache.token && Date.now() < kiwifyTokenCache.expiresAt) return kiwifyTokenCache.token
  if (!KIWIFY_CLIENT_ID || !KIWIFY_CLIENT_SECRET) return null

  const res = await fetch(`${KIWIFY_API}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: KIWIFY_CLIENT_ID,
      client_secret: KIWIFY_CLIENT_SECRET,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Kiwify OAuth error: ' + JSON.stringify(data))
  // Token valid for 96h, refresh at 90h
  kiwifyTokenCache = { token: data.access_token, expiresAt: Date.now() + 90 * 60 * 60 * 1000 }
  return kiwifyTokenCache.token
}

async function kiwifyFetch(path, params = {}) {
  const token = await getKiwifyToken()
  if (!token) throw new Error('Kiwify not configured')

  const url = new URL(`${KIWIFY_API}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-kiwify-account-id': KIWIFY_ACCOUNT_ID,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Kiwify API error ${res.status}: ${err}`)
  }
  return res.json()
}

// Fetch all sales pages for a date range (handles pagination, max 90-day window)
async function fetchAllKiwifySales(startDate, endDate) {
  const sales = []
  let page = 1
  const pageSize = 100
  let hasMore = true

  while (hasMore) {
    const data = await kiwifyFetch('/v1/sales', {
      start_date: startDate,
      end_date: endDate,
      page_number: String(page),
      page_size: String(pageSize),
    })

    const items = data.data || data.sales || data || []
    if (Array.isArray(items)) {
      sales.push(...items)
      hasMore = items.length === pageSize
    } else {
      // Handle paginated response with different structure
      const list = items.data || []
      sales.push(...list)
      hasMore = list.length === pageSize
    }
    page++
    if (page > 50) break // safety limit
  }
  return sales
}

// Kiwify sales data with comparison + cross-metrics with Meta Ads
app.get('/api/kiwify/sales', auth, async (req, res) => {
  try {
    if (!KIWIFY_CLIENT_ID) return res.json({ available: false })

    const { days = '30', since, until } = req.query
    const ranges = getDateRanges(parseInt(days), since, until)

    const [currentSales, previousSales, balanceData] = await Promise.all([
      fetchAllKiwifySales(ranges.current.since, ranges.current.until).catch(() => []),
      fetchAllKiwifySales(ranges.previous.since, ranges.previous.until).catch(() => []),
      kiwifyFetch('/v1/balance').catch(() => null),
    ])

    function processSales(sales) {
      // Kiwify statuses: paid, waiting_payment, refused, refunded
      const approved = sales.filter(s => (s.status || '').toLowerCase() === 'paid')
      const refunded = sales.filter(s => (s.status || '').toLowerCase() === 'refunded')
      const pending = sales.filter(s => (s.status || '').toLowerCase() === 'waiting_payment')
      const refused = sales.filter(s => (s.status || '').toLowerCase() === 'refused')

      // net_amount is in centavos (integer) — divide by 100
      const toReais = (v) => (typeof v === 'number' ? v : parseFloat(v || 0)) / 100

      const netRevenue = approved.reduce((sum, s) => sum + toReais(s.net_amount), 0)

      // Payment method breakdown
      const byMethod = {}
      approved.forEach(s => {
        const method = (s.payment_method || 'unknown').toLowerCase()
        if (!byMethod[method]) byMethod[method] = { count: 0, revenue: 0 }
        byMethod[method].count++
        byMethod[method].revenue += toReais(s.net_amount)
      })

      // Daily breakdown
      const byDay = {}
      approved.forEach(s => {
        const day = (s.created_at || '').split('T')[0]
        if (!day) return
        if (!byDay[day]) byDay[day] = { date: day, count: 0, revenue: 0 }
        byDay[day].count++
        byDay[day].revenue += toReais(s.net_amount)
      })

      // Product breakdown
      const byProduct = {}
      approved.forEach(s => {
        const name = s.product?.name || 'Produto'
        if (!byProduct[name]) byProduct[name] = { count: 0, revenue: 0 }
        byProduct[name].count++
        byProduct[name].revenue += toReais(s.net_amount)
      })

      return {
        totalSales: sales.length,
        approvedCount: approved.length,
        refundedCount: refunded.length,
        pendingCount: pending.length,
        refusedCount: refused.length,
        totalRevenue: netRevenue, // Kiwify only provides net_amount
        netRevenue,
        ticketMedio: approved.length > 0 ? netRevenue / approved.length : 0,
        approvalRate: sales.length > 0 ? ((approved.length / sales.length) * 100) : 0,
        refundRate: (approved.length + refunded.length) > 0 ? ((refunded.length / (approved.length + refunded.length)) * 100) : 0,
        byMethod,
        dailySales: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
        byProduct,
      }
    }

    const current = processSales(currentSales)
    const previous = processSales(previousSales)

    res.json({
      available: true,
      current,
      previous,
      ranges,
      balance: balanceData ? {
        available: (balanceData.available || 0) / 100,
        pending: (balanceData.pending || 0) / 100,
      } : null,
    })
  } catch (err) {
    console.error('[Kiwify]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Kiwify products list
app.get('/api/kiwify/products', auth, async (req, res) => {
  try {
    if (!KIWIFY_CLIENT_ID) return res.json({ available: false, products: [] })
    const data = await kiwifyFetch('/v1/products', { page_size: '50', page_number: '1' })
    res.json({ available: true, products: data.data || data || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// OVERVIEW (Aggregated data from all sources)
// =============================================

app.get('/api/overview/:accountId', auth, cacheMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params
    const accountName = req.query.name || ''
    const days = parseInt(req.query.days || '7')
    const { since, until } = req.query
    const ranges = getDateRanges(days, since, until)

    // Determine which data sources are available and fetch all in parallel
    const promises = {}

    // 1. Meta Ads (account-level + campaign-level for accurate lead counting)
    promises.meta = (async () => {
      try {
        const fields = 'spend,impressions,clicks,cpc,ctr,reach,actions,cost_per_action_type,action_values'
        const [current, previous, campaigns] = await Promise.all([
          metaFetch(`/${accountId}/insights`, { fields, time_range: JSON.stringify(ranges.current), limit: '500' }).catch(() => ({ data: [] })),
          metaFetch(`/${accountId}/insights`, { fields, time_range: JSON.stringify(ranges.previous), limit: '500' }).catch(() => ({ data: [] })),
          // Campaign-level to count leads + messaging correctly (avoid double-counting)
          metaFetch(`/${accountId}/insights`, { fields: 'campaign_name,actions', time_range: JSON.stringify(ranges.current), level: 'campaign', limit: '500' }).catch(() => ({ data: [] })),
        ])
        // Count leads and messaging separately per campaign (sum both)
        let campaignLeads = 0, campaignMessaging = 0
        for (const camp of (campaigns.data || [])) {
          const getAct = (type) => { const a = camp.actions?.find(x => x.action_type === type); return a ? parseFloat(a.value) : 0 }
          const lead = getAct('lead') || getAct('onsite_conversion.lead_grouped')
          const msg = getAct('onsite_conversion.messaging_conversation_started_7d')
          if (lead > 0) campaignLeads += lead
          if (msg > 0) campaignMessaging += msg
        }
        if (campaignLeads === 0 && campaignMessaging === 0) {
          // Fallback to account-level if campaign query returned no lead/messaging data
          const getAct = (actions, type) => { const a = actions?.find(x => x.action_type === type); return a ? parseFloat(a.value) : 0 }
          const acct = current.data?.[0]
          if (acct) {
            campaignLeads = getAct(acct.actions, 'lead') || getAct(acct.actions, 'onsite_conversion.lead_grouped')
            campaignMessaging = getAct(acct.actions, 'onsite_conversion.messaging_conversation_started_7d')
          }
        }
        return { available: true, current: current.data?.[0] || null, previous: previous.data?.[0] || null, campaignLeads, campaignMessaging }
      } catch { return { available: false } }
    })()

    // 2. Meta Ads daily
    promises.metaDaily = (async () => {
      try {
        const data = await metaFetch(`/${accountId}/insights`, {
          fields: 'spend,clicks,actions',
          time_range: JSON.stringify(ranges.current),
          time_increment: '1', limit: '100',
        }).catch(() => ({ data: [] }))
        return data.data || []
      } catch { return [] }
    })()

    // 3. Google Ads
    promises.gads = (async () => {
      try {
        const token = await getGadsAccessToken()
        if (!token) return { available: false }
        // Find matching Google Ads account
        const accounts = await gaqlQuery(GADS.loginCustomerId, `
          SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status
          FROM customer_client WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'
        `)
        const lower = accountName.toLowerCase()
        const cleaned = lower.replace(/^(ca\s*-?\s*|[\d]+\s*-\s*)/i, '').trim()
        const GENERIC_WORDS = ['imobiliária', 'imobiliaria', 'imoveis', 'imóveis', 'construtora', 'conta', 'nova', 'venda', 'vendas', 'teste', 'mkt', 'marketing']
        const words = cleaned.split(/[\s\-]+/).filter(w => w.length >= 3 && !GENERIC_WORDS.includes(w))
        const match = accounts.find(r => {
          const name = (r.customerClient.descriptiveName || '').toLowerCase()
          return words.some(w => name.includes(w))
        })
        if (!match) return { available: false }
        const cid = String(match.customerClient.id)
        const results = await gaqlQuery(cid, `
          SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
          FROM campaign WHERE segments.date BETWEEN '${ranges.current.since}' AND '${ranges.current.until}' AND campaign.status != 'REMOVED'
        `)
        const prevResults = await gaqlQuery(cid, `
          SELECT metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value
          FROM campaign WHERE segments.date BETWEEN '${ranges.previous.since}' AND '${ranges.previous.until}' AND campaign.status != 'REMOVED'
        `).catch(() => [])
        function sumGads(rows) {
          return rows.reduce((t, r) => ({
            spend: t.spend + parseInt(r.metrics.costMicros || 0) / 1000000,
            clicks: t.clicks + parseInt(r.metrics.clicks || 0),
            impressions: t.impressions + parseInt(r.metrics.impressions || 0),
            conversions: t.conversions + parseFloat(r.metrics.conversions || 0),
            revenue: t.revenue + parseFloat(r.metrics.conversionsValue || 0),
          }), { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 })
        }
        return { available: true, current: sumGads(results), previous: sumGads(prevResults) }
      } catch { return { available: false } }
    })()

    // 4. GA4
    promises.ga4 = (async () => {
      try {
        const props = getGA4Properties(accountName)
        if (!props || props.length === 0) return { available: false }
        const token = await getGoogleAccessToken()
        if (!token) return { available: false }
        const propId = props[0].id
        const d = days
        const data = await ga4Report(propId, {
          dateRanges: [{ startDate: `${d}daysAgo`, endDate: 'yesterday' }, { startDate: `${d * 2}daysAgo`, endDate: `${d + 1}daysAgo` }],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'bounceRate' }, { name: 'conversions' }, { name: 'engagementRate' }],
        }, token)
        function parseGA(row) {
          const v = row?.metricValues || []
          return { sessions: parseInt(v[0]?.value || 0), users: parseInt(v[1]?.value || 0), pageviews: parseInt(v[2]?.value || 0), bounceRate: parseFloat(v[3]?.value || 0) * 100, conversions: parseInt(v[4]?.value || 0), engagementRate: parseFloat(v[5]?.value || 0) * 100 }
        }
        // Daily sessions
        const dailyData = await ga4Report(propId, {
          dateRanges: [{ startDate: `${d}daysAgo`, endDate: 'yesterday' }],
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ dimension: { dimensionName: 'date' } }],
        }, token).catch(() => ({ rows: [] }))
        const daily = (dailyData.rows || []).map(r => ({ date: r.dimensionValues[0].value, sessions: parseInt(r.metricValues[0].value || 0) }))
        return { available: true, current: parseGA(data.rows?.[0]), previous: parseGA(data.rows?.[1]), daily }
      } catch { return { available: false } }
    })()

    // 5. CRM (with qualification data)
    promises.crm = (async () => {
      try {
        const config = getCRMConfig(accountName)
        if (!config) return { available: false }
        // Fetch CRM qualification data inline
        const sheetName = config.type === 'kellermann' ? 'ENTRADA DE LEADS' : 'LEADS'
        const rows = await fetchSheetCSV(config.id, sheetName)
        // Range exato (since/until ja calculados corretamente em ranges.current)
        const crmStart = new Date(ranges.current.since + 'T00:00:00')
        const crmEnd = new Date(ranges.current.until + 'T23:59:59')
        let crmLeads = []
        if (config.type === 'invista' || (!config.type || config.type === 'invista')) {
          const SKIP = ['Nome','DEZEMBRO','JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO']
          const VALID_ORIGENS = ['site - invistaimoveissm.com.br', 'facebook', 'instagram', 'whatsapp']
          const CORRETOR_DESQUAL = ['capao - claudia', 'capao da canoa', 'sem resposta', 'sem retorno', 'so informacao']
          const ESTADO_QUAL = ['em atendimento', 'em qualificacao', 'encaminhado ao setor', 'positiva', 'realmete transf']
          const ESTADO_DESQUAL = ['negatva', 'pausa temporariamente', 'sem evolucao', 'sem resposta']
          const stripAcc = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
          for (const row of rows) {
            if (row.length < 8) continue
            const ds = row[0], nm = row[3]
            if (!ds || !nm || SKIP.includes(nm) || ds === 'Data') continue
            const dt = parseBRDate(ds)
            if (!dt || dt < crmStart || dt > crmEnd) continue
            const orig = (row[6] || '').trim()
            if (!VALID_ORIGENS.includes(orig.toLowerCase())) continue
            const cor = (row[7] || '').trim()
            const est = (row[11] || '').trim()
            const corNorm = stripAcc(cor)
            const estNorm = stripAcc(est)
            const corInDesq = !cor || CORRETOR_DESQUAL.some(t => corNorm.includes(t))
            const estInQual = ESTADO_QUAL.some(t => estNorm.includes(t))
            const estInDesq = ESTADO_DESQUAL.some(t => estNorm.includes(t))
            let q = 'MEIO TERMO'
            if (!corInDesq && estInQual) q = 'SIM'
            else if (corInDesq && estInDesq) q = 'NÃO'
            crmLeads.push({ qualificacao: q })
          }
        } else if (config.type === 'sameco') {
          // Sameco: coluna T (row[19]) — ORÇAMENTO=SIM, NÃO EXISTE/NÃO QUER=NÃO, VENDEU=VENDEU, vazio=MEIO
          for (const row of rows) {
            if (row.length < 18) continue
            const id = row[0], createdTime = row[1], nome = row[16]
            if (!createdTime || !nome || nome === 'full_name' || id === 'ENTRADA DE LEADS - FORMULARIO') continue
            const dt = new Date(createdTime)
            if (isNaN(dt.getTime()) || dt < crmStart || dt > crmEnd) continue
            const qualRaw = (row[19] || '').trim()
            const qualNorm = qualRaw.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
            let q = 'MEIO TERMO'
            if (qualNorm.includes('VENDEU')) q = 'VENDEU'
            else if (qualNorm.startsWith('NAO')) q = 'NÃO'
            else if (qualNorm.includes('ORCAMENTO')) q = 'SIM'
            crmLeads.push({ qualificacao: q })
          }
        }
        const qualSim = crmLeads.filter(l => l.qualificacao === 'SIM').length
        const qualNao = crmLeads.filter(l => l.qualificacao === 'NÃO').length
        const qualMeio = crmLeads.filter(l => l.qualificacao === 'MEIO TERMO').length
        return { available: true, crmType: config.type, qualSim, qualNao, qualMeio, crmTotal: crmLeads.length }
      } catch { return { available: false } }
    })()

    // 6. Instagram
    promises.instagram = (async () => {
      try {
        let allPages = []
        let url = `${META_BASE}/me/accounts?fields=id,name,instagram_business_account{id,name,username,followers_count}&limit=100&access_token=${META_TOKEN}`
        while (url) {
          const resp = await fetch(url)
          const data = await resp.json()
          if (data.error) break
          allPages = allPages.concat(data.data || [])
          url = data.paging?.next || null
        }

        // Resolve match: 1) core_ig_page_id explicito do Hub (match exato) → 2) fuzzy legacy
        // Se cliente esta no Hub SEM core_ig_page_id vinculado, retorna unavailable
        // (evita cross-contamination: nao mostrar conta de OUTRO cliente porque o nome bateu).
        const hubCfg = getHubClientConfig(accountName)
        const pinnedIgPageId = hubCfg?.core_ig_page_id?.trim() || null
        let match = null

        if (pinnedIgPageId) {
          // Match exato pelo ID vinculado no Hub — aceita page_id ou instagram_business_account.id
          match = allPages.find(p =>
            p.id === pinnedIgPageId ||
            p.instagram_business_account?.id === pinnedIgPageId
          )
          if (!match) return { available: false, reason: 'ig-not-accessible', pinnedIgPageId }
        } else if (hubCfg) {
          // Cliente esta no Hub mas nao vinculou pagina IG → nao mostra dados de outra conta
          return { available: false, reason: 'not-linked-in-hub' }
        } else {
          // Fallback fuzzy: legacy pra clientes fora do Hub (ex: hardcoded ALLOWED_CLIENTS antigos)
          const lower = accountName.toLowerCase()
          const cleaned = lower.replace(/^(ca\s*-?\s*|[\d]+\s*-\s*)/i, '').trim()
          const words = cleaned.split(/[\s\-]+/).filter(w => w.length >= 3)
          match = allPages.find(p => {
            if (!p.instagram_business_account) return false
            const pageLower = (p.name || '').toLowerCase()
            const userLower = (p.instagram_business_account.username || '').toLowerCase()
            return words.some(w => pageLower.includes(w) || userLower.includes(w))
          })
          if (!match) return { available: false }
        }

        const igId = match.instagram_business_account.id
        const followers = match.instagram_business_account.followers_count || 0
        // Get reach + engagement
        const toUnix = (dateStr) => Math.floor(new Date(dateStr + 'T00:00:00').getTime() / 1000)
        const since = String(toUnix(ranges.current.since))
        const until = String(toUnix(ranges.current.until) + 86400)
        const insights = await metaFetch(`/${igId}/insights`, {
          metric: 'reach,total_interactions',
          metric_type: 'total_value',
          period: 'day',
          since, until,
        }).catch(() => ({ data: [] }))
        let reach = 0, interactions = 0
        ;(insights.data || []).forEach(m => {
          const val = m.total_value?.value || 0
          if (m.name === 'reach') reach = val
          if (m.name === 'total_interactions') interactions = val
        })
        return { available: true, followers, reach, interactions, username: match.instagram_business_account.username }
      } catch { return { available: false } }
    })()

    // 7. Kiwify
    promises.kiwify = (async () => {
      try {
        if (!KIWIFY_CLIENT_ID) return { available: false }
        const isJosi = accountName.toLowerCase().includes('josi') || accountName.toLowerCase().includes('josiane')
        if (!isJosi) return { available: false }
        const [curSales, prevSales] = await Promise.all([
          fetchAllKiwifySales(ranges.current.since, ranges.current.until).catch(() => []),
          fetchAllKiwifySales(ranges.previous.since, ranges.previous.until).catch(() => []),
        ])
        const toReais = (v) => (typeof v === 'number' ? v : parseFloat(v || 0)) / 100
        const approved = curSales.filter(s => s.status?.toLowerCase() === 'paid')
        const prevApproved = prevSales.filter(s => s.status?.toLowerCase() === 'paid')
        const revenue = approved.reduce((s, sale) => s + toReais(sale.net_amount), 0)
        const prevRevenue = prevApproved.reduce((s, sale) => s + toReais(sale.net_amount), 0)
        return { available: true, sales: approved.length, prevSales: prevApproved.length, revenue, prevRevenue }
      } catch { return { available: false } }
    })()

    // Await all
    const results = {}
    for (const [key, promise] of Object.entries(promises)) {
      results[key] = await promise
    }

    // Build aggregated overview
    const overview = { sources: {} }

    // Meta Ads aggregation
    if (results.meta?.available && results.meta.current) {
      const mc = results.meta.current
      const mp = results.meta.previous
      const getAct = (actions, type) => { const a = actions?.find(x => x.action_type === type); return a ? parseFloat(a.value) : 0 }
      const metaSpend = parseFloat(mc.spend || 0)
      const prevMetaSpend = mp ? parseFloat(mp.spend || 0) : 0
      // Use campaign-level deduplication (leads from form campaigns, messaging from non-form campaigns)
      const metaLeads = results.meta.campaignLeads
      const metaMessaging = results.meta.campaignMessaging
      const metaPurchases = getAct(mc.actions, 'purchase')
      const metaLinkClicks = getAct(mc.actions, 'link_click')
      const prevLeads = mp ? (getAct(mp.actions, 'lead') || getAct(mp.actions, 'onsite_conversion.lead_grouped')) : 0
      const prevMessaging = mp ? getAct(mp.actions, 'onsite_conversion.messaging_conversation_started_7d') : 0
      overview.sources.meta = {
        spend: metaSpend, prevSpend: prevMetaSpend,
        impressions: parseInt(mc.impressions || 0), reach: parseInt(mc.reach || 0),
        clicks: parseInt(mc.clicks || 0),
        leads: metaLeads, prevLeads,
        messaging: metaMessaging, prevMessaging,
        purchases: metaPurchases,
        linkClicks: metaLinkClicks,
      }
    }

    // Meta daily for chart
    if (results.metaDaily?.length > 0) {
      overview.metaDaily = results.metaDaily.map(d => {
        const getAct = (actions, type) => { const a = actions?.find(x => x.action_type === type); return a ? parseFloat(a.value) : 0 }
        return {
          date: d.date_start,
          spend: parseFloat(d.spend || 0),
          leads: (getAct(d.actions, 'lead') || getAct(d.actions, 'onsite_conversion.lead_grouped')) + getAct(d.actions, 'onsite_conversion.messaging_conversation_started_7d'),
        }
      })
    }

    // Google Ads aggregation
    if (results.gads?.available) {
      overview.sources.gads = {
        spend: results.gads.current.spend, prevSpend: results.gads.previous.spend,
        clicks: results.gads.current.clicks,
        impressions: results.gads.current.impressions,
        conversions: results.gads.current.conversions, prevConversions: results.gads.previous.conversions,
        revenue: results.gads.current.revenue,
      }
    }

    // GA4 aggregation
    if (results.ga4?.available) {
      overview.sources.ga4 = {
        sessions: results.ga4.current.sessions, prevSessions: results.ga4.previous?.sessions || 0,
        users: results.ga4.current.users, prevUsers: results.ga4.previous?.users || 0,
        pageviews: results.ga4.current.pageviews,
        bounceRate: results.ga4.current.bounceRate,
        engagementRate: results.ga4.current.engagementRate,
        conversions: results.ga4.current.conversions,
        daily: results.ga4.daily || [],
      }
    }

    // Instagram
    if (results.instagram?.available) {
      overview.sources.instagram = {
        followers: results.instagram.followers,
        reach: results.instagram.reach,
        interactions: results.instagram.interactions,
        username: results.instagram.username,
      }
    }

    // Kiwify
    if (results.kiwify?.available) {
      overview.sources.kiwify = {
        sales: results.kiwify.sales, prevSales: results.kiwify.prevSales,
        revenue: results.kiwify.revenue, prevRevenue: results.kiwify.prevRevenue,
      }
    }

    // CRM with qualification
    if (results.crm?.available) {
      overview.sources.crm = {
        available: true, crmType: results.crm.crmType,
        qualSim: results.crm.qualSim || 0,
        qualNao: results.crm.qualNao || 0,
        qualMeio: results.crm.qualMeio || 0,
        crmTotal: results.crm.crmTotal || 0,
      }
    }

    // Totals — leads = Meta leads + Meta messaging + Google Ads conversions
    const totalSpend = (overview.sources.meta?.spend || 0) + (overview.sources.gads?.spend || 0)
    const prevTotalSpend = (overview.sources.meta?.prevSpend || 0) + (overview.sources.gads?.prevSpend || 0)
    const metaConversions = Math.round((overview.sources.meta?.leads || 0) + (overview.sources.meta?.messaging || 0))
    const prevMetaConversions = Math.round((overview.sources.meta?.prevLeads || 0) + (overview.sources.meta?.prevMessaging || 0))
    const gadsConversions = Math.round(overview.sources.gads?.conversions || 0)
    const prevGadsConversions = Math.round(overview.sources.gads?.prevConversions || 0)
    const totalLeads = metaConversions + gadsConversions
    const prevTotalLeads = prevMetaConversions + prevGadsConversions
    const totalRevenue = (overview.sources.kiwify?.revenue || 0) + (overview.sources.gads?.revenue || 0)
    const prevTotalRevenue = (overview.sources.kiwify?.prevRevenue || 0)

    overview.totals = {
      spend: totalSpend, prevSpend: prevTotalSpend,
      leads: totalLeads, prevLeads: prevTotalLeads,
      metaConversions, prevMetaConversions, gadsConversions, prevGadsConversions,
      sessions: overview.sources.ga4?.sessions || 0, prevSessions: overview.sources.ga4?.prevSessions || 0,
      revenue: totalRevenue, prevRevenue: prevTotalRevenue,
      cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      prevCpl: prevTotalLeads > 0 ? prevTotalSpend / prevTotalLeads : 0,
      roas: totalSpend > 0 && totalRevenue > 0 ? totalRevenue / totalSpend : 0,
    }

    // Alerts (only bounce rate warning)
    overview.alerts = []
    if (overview.sources.ga4?.bounceRate > 70) overview.alerts.push({ type: 'warning', text: `Taxa de rejeicao do site alta: ${overview.sources.ga4.bounceRate.toFixed(1)}%` })

    res.json(overview)
  } catch (err) {
    console.error('[Overview]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Production: serve built frontend ────────────────────────────
const distPath = resolve(__dirname, '../dist')
if (fs.existsSync(distPath)) {
  app.use('/core', (req, res, next) => {
    if (req.path.startsWith('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else if (req.path.endsWith('.html') || req.path === '/') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    }
    next()
  }, express.static(distPath))

  app.get('/core/{*path}', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.sendFile(resolve(distPath, 'index.html'))
  })
  console.log('[Dros Core] Serving frontend from /core/')
}

// =============================================================================
// FASE 0 — ENDPOINTS CACHED (le do SQLite, formato compativel com /meta/*)
// =============================================================================

function resolveDateRange(days, since, until) {
  if (since && until) return { since, until }
  // ultimos N dias ate ontem (D-1)
  const end = new Date(); end.setDate(end.getDate() - 1)
  const start = new Date(end); start.setDate(start.getDate() - parseInt(days) + 1)
  return { since: fmtDate(start), until: fmtDate(end) }
}

function calcPreviousRange(range) {
  const start = new Date(range.since + 'T00:00:00')
  const end = new Date(range.until + 'T00:00:00')
  const diffDays = Math.ceil((end - start) / 86400000) + 1
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - diffDays + 1)
  return { since: fmtDate(prevStart), until: fmtDate(prevEnd) }
}

// Insights agregados por nivel (account/campaign) — equivalente ao /insights/compare
app.get('/api/meta/cached/accounts/:accountId/insights/compare', auth, (req, res) => {
  try {
    const { accountId } = req.params
    const { days = '30', level = 'account', since, until } = req.query
    const current = resolveDateRange(days, since, until)
    const previous = calcPreviousRange(current)

    const currentData = level === 'campaign'
      ? agg.getCampaignInsights(accountId, current.since, current.until)
      : agg.getAccountInsights(accountId, current.since, current.until)
    const previousData = level === 'campaign'
      ? agg.getCampaignInsights(accountId, previous.since, previous.until)
      : agg.getAccountInsights(accountId, previous.since, previous.until)

    res.json({ current: currentData, previous: previousData, ranges: { current, previous } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Insights por dia (para grafico) — equivalente ao /insights/daily-compare
app.get('/api/meta/cached/accounts/:accountId/insights/daily-compare', auth, (req, res) => {
  try {
    const { accountId } = req.params
    const { days = '30', since, until } = req.query
    const current = resolveDateRange(days, since, until)
    const previous = calcPreviousRange(current)

    res.json({
      current: agg.getDailyAccountInsights(accountId, current.since, current.until),
      previous: agg.getDailyAccountInsights(accountId, previous.since, previous.until),
      ranges: { current, previous },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Adsets de campanha com insights agregados
app.get('/api/meta/cached/campaigns/:campaignId/adsets', auth, (req, res) => {
  try {
    const { campaignId } = req.params
    const { days = '30', since, until, accountId } = req.query
    if (!accountId) return res.status(400).json({ error: 'accountId query param required' })
    const range = resolveDateRange(days, since, until)

    const adsets = agg.getAdsets(accountId, campaignId)
    const insights = agg.getAdsetInsightsByCampaign(accountId, campaignId, range.since, range.until)
    const insightsMap = new Map(insights.map(i => [i.adset_id, i]))

    const data = adsets.map(a => ({ ...a, insight: insightsMap.get(a.id) || null }))
    res.json({ data, ranges: { current: range } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Ads de adset com insights + creative
app.get('/api/meta/cached/adsets/:adsetId/ads', auth, (req, res) => {
  try {
    const { adsetId } = req.params
    const { days = '30', since, until, accountId } = req.query
    if (!accountId) return res.status(400).json({ error: 'accountId query param required' })
    const range = resolveDateRange(days, since, until)

    const ads = agg.getAdsWithCreatives(accountId, adsetId)
    const insights = agg.getAdInsightsByAdset(accountId, adsetId, range.since, range.until)
    const insightsMap = new Map(insights.map(i => [i.ad_id, i]))

    const data = ads.map(ad => ({ ...ad, insight: insightsMap.get(ad.id) || null }))
    res.json({ data, ranges: { current: range } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Top ads (todos os ads da conta com insights + creative, frontend ordena)
app.get('/api/meta/cached/accounts/:accountId/top-ads', auth, (req, res) => {
  try {
    const { accountId } = req.params
    const { days = '30', since, until } = req.query
    const range = resolveDateRange(days, since, until)

    const ads = agg.getAllAdsWithCreatives(accountId)
    const insights = agg.getAllAdInsights(accountId, range.since, range.until)
    const insightsMap = new Map(insights.map(i => [i.ad_id, i]))

    const data = ads.map(ad => ({ ...ad, insight: insightsMap.get(ad.id) || null }))
      .filter(ad => ad.insight && parseFloat(ad.insight.spend || '0') > 0)

    res.json({ data, ranges: { current: range } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Campanhas da conta (estrutura do cache)
app.get('/api/meta/cached/accounts/:accountId/campaigns', auth, (req, res) => {
  try {
    res.json({ data: agg.getCampaigns(req.params.accountId) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Meta info: quando foi a ultima sync dessa conta
app.get('/api/meta/cached/accounts/:accountId/status', auth, (req, res) => {
  try {
    const latest = agg.getAccountLastSync(req.params.accountId)
    res.json({ last_update: latest })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// =============================================================================
// SYNC MANUAL (botao "Sincronizar" do dashboard)
// =============================================================================
app.post('/api/meta/sync/:accountId', auth, async (req, res) => {
  try {
    const { accountId } = req.params
    const daysBack = parseInt(req.query.days || '2')
    const result = await syncAccount(accountId, META_TOKEN, daysBack)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// =============================================================================
// FASE A — DASHBOARD CONFIG (personalizacao)
// =============================================================================

app.get('/api/dashboard/config/:accountId', auth, (req, res) => {
  try {
    const cfg = getDashboardConfig(req.params.accountId)
    res.json(cfg)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/dashboard/config/:accountId', auth, (req, res) => {
  try {
    const { config } = req.body || {}
    if (!config) return res.status(400).json({ error: 'config required in body' })
    saveDashboardConfig(req.params.accountId, config)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/dashboard/config/:accountId/publish', auth, (req, res) => {
  try {
    const { accountId } = req.params
    const existing = getDashboardConfig(accountId)
    let slug = existing.public_slug
    if (!slug) {
      slug = nanoid(12)
      setDashboardSlug(accountId, slug)
    }
    res.json({ slug })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/dashboard/config/:accountId/publish', auth, (req, res) => {
  try {
    setDashboardSlug(req.params.accountId, null)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Templates
app.get('/api/dashboard/templates', auth, (_req, res) => res.json({ data: listTemplates() }))
app.post('/api/dashboard/templates', auth, (req, res) => {
  const { name, config } = req.body || {}
  if (!name || !config) return res.status(400).json({ error: 'name + config required' })
  const id = saveTemplate(name, config)
  res.json({ id })
})
app.get('/api/dashboard/templates/:id', auth, (req, res) => {
  const cfg = getTemplate(parseInt(req.params.id))
  if (!cfg) return res.status(404).json({ error: 'not found' })
  res.json({ config: cfg })
})
app.delete('/api/dashboard/templates/:id', auth, (req, res) => {
  removeTemplate(parseInt(req.params.id))
  res.json({ ok: true })
})

// =============================================================================
// FASE D — ROTAS PUBLICAS (link publico sem login, escopadas por slug)
// =============================================================================

// Middleware: resolve slug -> accountId + config, sem exigir auth
// Valida tambem que o cliente ainda esta ATIVO no Hub — se foi inativado,
// o link publico automaticamente para de funcionar.
function publicResolve(req, res, next) {
  const { slug } = req.params
  const found = getConfigBySlug(slug)
  if (!found) return res.status(404).json({ error: 'link publico nao encontrado' })

  // Checa se cliente ainda tem conta Meta configurada e ativa no Hub
  const accountIdWithPrefix = found.account_id.startsWith('act_') ? found.account_id : `act_${found.account_id}`
  const accountIdWithoutPrefix = found.account_id.replace(/^act_/, '')
  const hubClient = HUB_CLIENTS.find(c => {
    const cid = (c.core_meta_account_id || '').trim()
    return cid && (cid === accountIdWithPrefix || cid === accountIdWithoutPrefix || `act_${cid}` === accountIdWithPrefix)
  })

  if (!hubClient) {
    return res.status(410).json({ error: 'link desativado pela agencia' })
  }

  req.publicAccountId = found.account_id
  req.publicConfig = found.config
  req.publicHubClient = hubClient
  next()
}

// Info + config do dashboard publico
app.get('/api/public/dashboard/:slug', publicResolve, (req, res) => {
  // Puxa nome da conta Meta se disponivel (best effort)
  res.json({
    account_id: req.publicAccountId,
    config: req.publicConfig,
    last_update: getAccountLatestUpdate(req.publicAccountId),
  })
})

// Insights compare (public)
app.get('/api/public/dashboard/:slug/insights/compare', publicResolve, (req, res) => {
  try {
    const accountId = req.publicAccountId
    const { days = '30', level = 'account', since, until } = req.query
    const current = resolveDateRange(days, since, until)
    const previous = calcPreviousRange(current)
    const currentData = level === 'campaign'
      ? agg.getCampaignInsights(accountId, current.since, current.until)
      : agg.getAccountInsights(accountId, current.since, current.until)
    const previousData = level === 'campaign'
      ? agg.getCampaignInsights(accountId, previous.since, previous.until)
      : agg.getAccountInsights(accountId, previous.since, previous.until)
    res.json({ current: currentData, previous: previousData, ranges: { current, previous } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/public/dashboard/:slug/insights/daily-compare', publicResolve, (req, res) => {
  try {
    const accountId = req.publicAccountId
    const { days = '30', since, until } = req.query
    const current = resolveDateRange(days, since, until)
    const previous = calcPreviousRange(current)
    res.json({
      current: agg.getDailyAccountInsights(accountId, current.since, current.until),
      previous: agg.getDailyAccountInsights(accountId, previous.since, previous.until),
      ranges: { current, previous },
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/public/dashboard/:slug/top-ads', publicResolve, (req, res) => {
  try {
    const accountId = req.publicAccountId
    const { days = '30', since, until } = req.query
    const range = resolveDateRange(days, since, until)
    const ads = agg.getAllAdsWithCreatives(accountId)
    const insights = agg.getAllAdInsights(accountId, range.since, range.until)
    const insightsMap = new Map(insights.map(i => [i.ad_id, i]))
    const data = ads.map(ad => ({ ...ad, insight: insightsMap.get(ad.id) || null }))
      .filter(ad => ad.insight && parseFloat(ad.insight.spend || '0') > 0)
    res.json({ data, ranges: { current: range } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/public/dashboard/:slug/campaigns', publicResolve, (req, res) => {
  try {
    res.json({ data: agg.getCampaigns(req.publicAccountId) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/public/dashboard/:slug/campaigns/:campaignId/adsets', publicResolve, (req, res) => {
  try {
    const accountId = req.publicAccountId
    const { days = '30', since, until } = req.query
    const range = resolveDateRange(days, since, until)
    const adsets = agg.getAdsets(accountId, req.params.campaignId)
    const insights = agg.getAdsetInsightsByCampaign(accountId, req.params.campaignId, range.since, range.until)
    const map = new Map(insights.map(i => [i.adset_id, i]))
    res.json({ data: adsets.map(a => ({ ...a, insight: map.get(a.id) || null })) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/public/dashboard/:slug/adsets/:adsetId/ads', publicResolve, (req, res) => {
  try {
    const accountId = req.publicAccountId
    const { days = '30', since, until } = req.query
    const range = resolveDateRange(days, since, until)
    const ads = agg.getAdsWithCreatives(accountId, req.params.adsetId)
    const insights = agg.getAdInsightsByAdset(accountId, req.params.adsetId, range.since, range.until)
    const map = new Map(insights.map(i => [i.ad_id, i]))
    res.json({ data: ads.map(ad => ({ ...ad, insight: map.get(ad.id) || null })) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// =============================================================================
// CRON — snapshot diario 04:00 + warmup cache de TODAS as APIs por cliente
// =============================================================================

// Warmup: chama endpoints Google Ads/IG/GA4/Overview pra cada cliente do Hub
// pra popular cache HTTP. Roda depois do snapshot Meta.
// So os endpoints "core" que a maioria das aba abre — nao inclui keywords/search-terms
// que sao secundarios.
async function warmupCacheForClient(client, adminToken) {
  const jobs = []
  const days = 30  // range mais comum que o dashboard abre

  // Overview (agrega tudo — chamada mais critica)
  if (client.name) {
    jobs.push(fetch(`http://localhost:${PORT}/api/overview/${encodeURIComponent(client.core_meta_account_id || client.name)}?days=${days}&accountName=${encodeURIComponent(client.name)}&refresh=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => null))
  }

  // Google Ads (se configurado)
  if (client.core_gads_customer_id) {
    const cid = client.core_gads_customer_id.replace(/-/g, '')
    const endpoints = ['campaigns', 'daily', 'conversions']  // essenciais pro dashboard
    for (const ep of endpoints) {
      jobs.push(fetch(`http://localhost:${PORT}/api/google-ads/${cid}/${ep}?days=${days}&refresh=1`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => null))
    }
  }

  // Instagram (se configurado)
  if (client.core_ig_page_id) {
    const ig = client.core_ig_page_id
    jobs.push(fetch(`http://localhost:${PORT}/api/instagram/${ig}/profile?refresh=1`, { headers: { Authorization: `Bearer ${adminToken}` } }).catch(() => null))
    jobs.push(fetch(`http://localhost:${PORT}/api/instagram/${ig}/insights?days=${days}&refresh=1`, { headers: { Authorization: `Bearer ${adminToken}` } }).catch(() => null))
    jobs.push(fetch(`http://localhost:${PORT}/api/instagram/${ig}/media?limit=24&refresh=1`, { headers: { Authorization: `Bearer ${adminToken}` } }).catch(() => null))
  }

  // GA4 (se configurado)
  if (client.core_ga4_property_id) {
    jobs.push(fetch(`http://localhost:${PORT}/api/analytics/${client.core_ga4_property_id}/report?days=${days}&refresh=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => null))
  }

  await Promise.allSettled(jobs)
  return jobs.length
}

// Gera JWT admin pra chamar os proprios endpoints internamente
function generateAdminToken() {
  return jwt.sign({ id: 'cron', email: 'cron@internal', name: 'Cron', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
}

async function runNightlySnapshot() {
  console.log('[Snapshot cron] === iniciando ciclo noturno ===')
  const startTime = Date.now()

  // Fase 1: snapshot Meta Ads (SQLite estruturado, dados diarios granulares)
  try {
    let accounts = []
    let url = `${META_BASE}/me/adaccounts?fields=id,name,account_status&limit=200&access_token=${META_TOKEN}`
    while (url) {
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.error) throw new Error(data.error.message)
      accounts.push(...(data.data || []))
      url = data.paging?.next || null
    }
    console.log(`[Snapshot cron] Meta: ${accounts.length} contas encontradas`)
    const result = await syncAllAccounts(accounts, META_TOKEN, 2)
    console.log(`[Snapshot cron] Meta concluido: ok=${result.ok} err=${result.err}`)
  } catch (err) {
    console.error('[Snapshot cron] Meta falhou:', err.message)
  }

  // Fase 2: warmup cache HTTP das outras APIs (Google Ads / IG / GA4 / Overview)
  // Roda pra cada cliente do Hub em batches de 2 (respeitar rate limits)
  try {
    await syncFromHub()  // garantir HUB_CLIENTS atualizado
    const activeClients = HUB_CLIENTS.filter(c => c.core_meta_account_id || c.core_gads_customer_id || c.core_ig_page_id || c.core_ga4_property_id)
    console.log(`[Snapshot cron] Warmup cache: ${activeClients.length} clientes ativos`)
    const adminToken = generateAdminToken()

    const BATCH = 2
    let warmed = 0
    for (let i = 0; i < activeClients.length; i += BATCH) {
      const batch = activeClients.slice(i, i + BATCH)
      const results = await Promise.allSettled(batch.map(c => warmupCacheForClient(c, adminToken)))
      warmed += results.filter(r => r.status === 'fulfilled').length
      // Pausa 2s entre batches pra dar folga aos APIs
      if (i + BATCH < activeClients.length) await new Promise(r => setTimeout(r, 2000))
    }
    console.log(`[Snapshot cron] Warmup concluido: ${warmed}/${activeClients.length} clientes`)
  } catch (err) {
    console.error('[Snapshot cron] Warmup falhou:', err.message)
  }

  const totalSec = Math.round((Date.now() - startTime) / 1000)
  console.log(`[Snapshot cron] === ciclo completo em ${totalSec}s ===`)
}

// 04:00 America/Sao_Paulo todo dia
cron.schedule('0 4 * * *', runNightlySnapshot, { timezone: 'America/Sao_Paulo' })
console.log('[Snapshot cron] agendado pra 04:00 America/Sao_Paulo diariamente')

// Endpoint pra rodar warmup manual do cache (util pra testar sem esperar 4am)
// Popula cache HTTP de todos os clientes ativos do Hub
app.post('/api/cache/warmup', auth, async (_req, res) => {
  try {
    await syncFromHub()
    const activeClients = HUB_CLIENTS.filter(c => c.core_meta_account_id || c.core_gads_customer_id || c.core_ig_page_id || c.core_ga4_property_id)
    const adminToken = generateAdminToken()
    const t0 = Date.now()
    const BATCH = 2
    let done = 0
    for (let i = 0; i < activeClients.length; i += BATCH) {
      const batch = activeClients.slice(i, i + BATCH)
      const results = await Promise.allSettled(batch.map(c => warmupCacheForClient(c, adminToken)))
      done += results.filter(r => r.status === 'fulfilled').length
    }
    res.json({ ok: true, clients_warmed: done, total: activeClients.length, seconds: Math.round((Date.now() - t0) / 1000) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Endpoint pra rodar sync geral manual (admin only)
app.post('/api/meta/sync-all', auth, async (_req, res) => {
  try {
    let accounts = []
    let url = `${META_BASE}/me/adaccounts?fields=id,name,account_status&limit=200&access_token=${META_TOKEN}`
    while (url) {
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.error) throw new Error(data.error.message)
      accounts.push(...(data.data || []))
      url = data.paging?.next || null
    }
    const result = await syncAllAccounts(accounts, META_TOKEN, 2)
    res.json({ ok: true, accounts: accounts.length, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const server = app.listen(PORT, () => {
  console.log(`[Dros Dashboard API] Running on http://localhost:${PORT}`)
  if (!GADS.refreshToken) {
    console.log(`[Google Ads] No refresh token. Visit http://localhost:${PORT}/api/google-ads/auth to authorize.`)
  }
  if (!KIWIFY_CLIENT_ID) {
    console.log(`[Kiwify] Not configured. Add KIWIFY_CLIENT_ID, KIWIFY_CLIENT_SECRET, KIWIFY_ACCOUNT_ID to .env`)
  }
})

// Keep process alive (ESM + Express 5 on Node 24 can exit prematurely)
setInterval(() => {}, 1 << 30)
