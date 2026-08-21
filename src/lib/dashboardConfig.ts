// Config de dashboard personalizavel — persistido em SQLite via API.

const API_BASE = import.meta.env.DEV ? '' : '/core'

function getToken(): string | null {
  const embed = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('embed_token') : null
  return embed || (typeof localStorage !== 'undefined' ? localStorage.getItem('dros_token') : null)
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      ...(opts?.headers || {}),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export interface DashboardConfig {
  cards: string[]              // ordem dos metric-keys nos cards do topo
  funnel: string[]             // ordem das etapas do funil (metric-keys)
  chartDefaultMetric: string   // metric-key default do grafico de barras
  chartAvailableMetrics: string[]  // metric-keys que aparecem como tabs no grafico
  table: string[]              // metric-keys das colunas da tabela de campanhas
  topCreativesSort: string     // metric-key default do filtro de top criativos
  sections: {
    key: string                // 'cards' | 'chart' | 'funnel' | 'campaigns' | 'topCreatives'
    visible: boolean
    order: number
  }[]
}

// Config padrao (usada quando o cliente ainda nao personalizou)
export const DEFAULT_CONFIG: DashboardConfig = {
  cards: ['spend', 'impressions', 'reach', 'link_clicks', 'ctr', 'messaging', 'leads'],
  funnel: ['impressions', 'reach', 'link_clicks', 'purchases'],
  chartDefaultMetric: 'spend',
  chartAvailableMetrics: ['spend', 'impressions', 'reach', 'clicks', 'link_clicks', 'messaging', 'purchases', 'revenue', 'add_to_cart', 'initiate_checkout', 'leads', 'page_views', 'video_views', 'post_engagement'],
  table: ['spend', 'impressions', 'link_clicks', 'ctr', 'purchases', 'cost_per_purchase'],
  topCreativesSort: 'spend',
  sections: [
    { key: 'cards',        visible: true, order: 0 },
    { key: 'chart',        visible: true, order: 1 },
    { key: 'funnel',       visible: true, order: 2 },
    { key: 'campaigns',    visible: true, order: 3 },
    { key: 'topCreatives', visible: true, order: 4 },
  ],
}

// Merge parcial com defaults (garante que campos faltantes usem default)
export function mergeConfig(partial: Partial<DashboardConfig> | null | undefined): DashboardConfig {
  if (!partial) return { ...DEFAULT_CONFIG, sections: [...DEFAULT_CONFIG.sections] }
  return {
    cards: partial.cards?.length ? partial.cards : DEFAULT_CONFIG.cards,
    funnel: partial.funnel?.length ? partial.funnel : DEFAULT_CONFIG.funnel,
    chartDefaultMetric: partial.chartDefaultMetric || DEFAULT_CONFIG.chartDefaultMetric,
    chartAvailableMetrics: partial.chartAvailableMetrics?.length ? partial.chartAvailableMetrics : DEFAULT_CONFIG.chartAvailableMetrics,
    table: partial.table?.length ? partial.table : DEFAULT_CONFIG.table,
    topCreativesSort: partial.topCreativesSort || DEFAULT_CONFIG.topCreativesSort,
    sections: partial.sections?.length ? partial.sections : [...DEFAULT_CONFIG.sections],
  }
}

// ============ API calls ============

export async function fetchDashboardConfig(accountId: string): Promise<{ config: DashboardConfig; public_slug: string | null }> {
  const res = await apiFetch<{ config: Partial<DashboardConfig> | null; public_slug: string | null }>(`/api/dashboard/config/${accountId}`)
  return { config: mergeConfig(res.config), public_slug: res.public_slug }
}

export async function saveDashboardConfig(accountId: string, config: DashboardConfig): Promise<void> {
  await apiFetch(`/api/dashboard/config/${accountId}`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

export async function publishDashboard(accountId: string): Promise<string> {
  const res = await apiFetch<{ slug: string }>(`/api/dashboard/config/${accountId}/publish`, { method: 'POST' })
  return res.slug
}

export async function unpublishDashboard(accountId: string): Promise<void> {
  await apiFetch(`/api/dashboard/config/${accountId}/publish`, { method: 'DELETE' })
}

// ============ Public dashboard (sem auth) ============

export async function fetchPublicDashboard(slug: string): Promise<{ account_id: string; config: DashboardConfig; last_update: string | null }> {
  const res = await fetch(`${API_BASE}/api/public/dashboard/${slug}`)
  if (!res.ok) throw new Error(`Erro ao carregar dashboard publico: ${res.status}`)
  const data = await res.json()
  return { ...data, config: mergeConfig(data.config) }
}

// ============ Sync manual ============

export async function syncAccountNow(accountId: string): Promise<{ ok: number; errors: string[] }> {
  return apiFetch(`/api/meta/sync/${accountId}?days=2`, { method: 'POST' })
}

export async function getAccountSyncStatus(accountId: string): Promise<{ last_update: string | null }> {
  return apiFetch(`/api/meta/cached/accounts/${accountId}/status`)
}

// Forca sync com Hub (pra pegar clientes novos sem esperar 10 min)
export async function refreshHub(): Promise<{ ok: boolean; hub_clients: number; with_meta: number; with_ig: number; with_gads: number }> {
  return apiFetch(`/api/hub/refresh`, { method: 'POST' })
}
