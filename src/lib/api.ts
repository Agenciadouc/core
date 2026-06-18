// Em embed mode (iframe vindo do /hub) o token vem na URL como ?embed_token=XXX
function getEmbedTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('embed_token')
}
function getToken(): string | null {
  return getEmbedTokenFromUrl() || localStorage.getItem('dros_token')
}
const isEmbed = () => !!getEmbedTokenFromUrl()
const API_BASE = import.meta.env.DEV ? '' : '/core'

async function apiFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (res.status === 401) {
    // Em embed mode nao redireciona pra /login (quebraria o iframe — fica preso em loop)
    if (!isEmbed()) {
      localStorage.removeItem('dros_token')
      window.location.href = '/core/login'
    }
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export interface MetaAccount {
  id: string
  name: string
  account_status: number
  currency: string
  amount_spent: string
}

export interface MetaAction {
  action_type: string
  value: string
}

export interface MetaInsight {
  spend: string
  impressions: string
  clicks: string
  cpc: string
  cpm: string
  ctr: string
  reach: string
  frequency: string
  actions?: MetaAction[]
  cost_per_action_type?: MetaAction[]
  action_values?: MetaAction[]
  date_start: string
  date_stop: string
  campaign_id?: string
  campaign_name?: string
}

export interface DailyInsight {
  spend: string
  impressions: string
  clicks: string
  cpc: string
  ctr: string
  reach: string
  actions?: MetaAction[]
  action_values?: MetaAction[]
  date_start: string
  date_stop: string
}

export interface CompareResponse {
  current: MetaInsight[]
  previous: MetaInsight[]
  ranges: { current: { since: string; until: string }; previous: { since: string; until: string } }
}

export interface DailyCompareResponse {
  current: DailyInsight[]
  previous: DailyInsight[]
  ranges: { current: { since: string; until: string }; previous: { since: string; until: string } }
}

export async function fetchAccounts(): Promise<MetaAccount[]> {
  const data = await apiFetch<{ accounts: MetaAccount[] }>('/api/meta/accounts')
  return data.accounts
}

export async function fetchCompare(accountId: string, days = 30, level = 'account', since?: string, until?: string): Promise<CompareResponse> {
  let url = `/api/meta/accounts/${accountId}/insights/compare?days=${days}&level=${level}`
  if (since && until) url += `&since=${since}&until=${until}`
  return apiFetch<CompareResponse>(url)
}

export async function fetchDailyCompare(accountId: string, days = 30, since?: string, until?: string): Promise<DailyCompareResponse> {
  let url = `/api/meta/accounts/${accountId}/insights/daily-compare?days=${days}`
  if (since && until) url += `&since=${since}&until=${until}`
  return apiFetch<DailyCompareResponse>(url)
}

// Helper to extract action value
export function getAction(actions: MetaAction[] | undefined, type: string): number {
  const a = actions?.find((x) => x.action_type === type)
  return a ? parseFloat(a.value) : 0
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

export function formatPercent(n: number): string {
  return n.toFixed(2).replace('.', ',') + '%'
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

export const DAYS_MAP: Record<string, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
}

// =============================================
// CRM API
// =============================================

export interface CRMSourceBreakdown {
  source: string
  total: number
  emAtendimento: number
  semResposta: number
  visited: number
  venda: number
  locacao: number
  qualRate: string
  visitRate: string
}

export interface CRMData {
  available: boolean
  crmType?: string
  total: number
  funnel: {
    emQualificacao: number
    emAtendimento: number
    semResposta: number
    negativa: number
    visitScheduled: number
    visited: number
  }
  funnelRates: {
    leadToQualified: string
    qualifiedToAtendimento: string
    atendimentoToVisit: string
  }
  previous: {
    total: number
    emAtendimento: number
    semResposta: number
    visited: number
  }
  sourceCounts: Record<string, number>
  interestCounts: Record<string, number>
  agentCounts: Record<string, number>
  perSource: CRMSourceBreakdown[]
  dailyLeads: { date: string; count: number }[]
  adsLeads: number
  semCorretor: number
  semRetorno?: number
  qualified?: number
  qualSim?: number
  qualNao?: number
  qualMeio?: number
  qualVendido?: number
  qualEmAtendimento?: number
  agentQual?: Record<string, { total: number; sim: number; nao: number; meio: number; semRetorno: number }>
  sourceQual?: Record<string, { total: number; sim: number; nao: number; meio: number; semRetorno: number; vendido: number }>
  generalQualRate?: string
  tipoCounts?: Record<string, number>
  faixaCounts?: Record<string, number>
  visitRate: string
  qualificationRate: string
  noResponseRate: string
  // Ludus-specific
  totalVendas?: number
  totalValor?: number
  ticketMedio?: number
  canalStats?: Record<string, { vendas: number; valor: number }>
  personalStats?: Record<string, { vendas: number; valor: number }>
  comercialStats?: Record<string, { vendas: number; valor: number }>
  dailySales?: { date: string; count: number; valor: number }[]
}

export async function fetchCRM(accountId: string, accountName: string, days = 7): Promise<CRMData> {
  return apiFetch<CRMData>(`/api/crm/${accountId}?name=${encodeURIComponent(accountName)}&days=${days}`)
}

// =============================================
// BG IMOB CRM
// =============================================

export interface BGImobCorretorStats {
  total: number
  naoRespondeu: number
  emAtendimento: number
  visita: number
  proposta: number
  comprou: number
}

export interface BGImobAdStats {
  total: number
  qualificado: number
  naoResp: number
  visita: number
  proposta: number
  comprou: number
}

export interface BGImobCRMData {
  available: boolean
  crmType: 'bgimob'
  total: number
  funnel: { naoRespondeu: number; emAtendimento: number; visita: number; proposta: number; comprou: number; semStatus: number }
  qualificados: number
  qualRate: string
  naoRespRate: string
  previous: { total: number; qualificados: number; naoRespondeu: number }
  corretorStats: Record<string, BGImobCorretorStats>
  adStats: Record<string, BGImobAdStats>
  platformStats: Record<string, { total: number; qualificado: number }>
  conheceBGStats: { sim: number; nao: number }
  dailyLeads: { date: string; count: number }[]
}

export async function fetchBGImobCRM(accountId: string, accountName: string, days = 7): Promise<BGImobCRMData> {
  return apiFetch<BGImobCRMData>(`/api/crm/${accountId}?name=${encodeURIComponent(accountName)}&days=${days}`)
}

// =============================================
// INSTAGRAM API
// =============================================

export interface IGAccount {
  id: string
  pageId: string
  pageName: string
  name: string
  username: string
  followers_count: number
  follows_count: number
  media_count: number
  profile_picture_url?: string
}

export interface IGProfile {
  id: string
  name: string
  username: string
  followers_count: number
  follows_count: number
  media_count: number
  profile_picture_url?: string
  biography?: string
}

export interface IGDailyPoint {
  date: string
  value: number
}

export interface IGInsightsResponse {
  current: { totals: Record<string, number>; daily: Record<string, IGDailyPoint[]> }
  previous: { totals: Record<string, number>; daily: Record<string, IGDailyPoint[]> }
  ranges: { current: { since: string; until: string }; previous: { since: string; until: string } }
}

export interface IGMedia {
  id: string
  caption?: string
  media_type: string
  media_url?: string
  thumbnail_url?: string
  permalink: string
  timestamp: string
  like_count: number
  comments_count: number
  insights: Record<string, number>
}

export async function fetchIGAccounts(): Promise<IGAccount[]> {
  const data = await apiFetch<{ accounts: IGAccount[] }>('/api/instagram/accounts')
  return data.accounts
}

export async function fetchIGProfile(igId: string): Promise<IGProfile> {
  return apiFetch<IGProfile>(`/api/instagram/${igId}/profile`)
}

export async function fetchIGInsights(igId: string, days = 7): Promise<IGInsightsResponse> {
  return apiFetch<IGInsightsResponse>(`/api/instagram/${igId}/insights?days=${days}`)
}

export async function fetchIGMedia(igId: string, limit = 20): Promise<IGMedia[]> {
  const data = await apiFetch<{ data: IGMedia[] }>(`/api/instagram/${igId}/media?limit=${limit}`)
  return data.data || []
}

// =============================================
// KIWIFY API
// =============================================

export interface KiwifyMethodBreakdown {
  count: number
  revenue: number
}

export interface KiwifyDailySale {
  date: string
  count: number
  revenue: number
}

export interface KiwifyProductBreakdown {
  count: number
  revenue: number
}

export interface KiwifyPeriodData {
  totalSales: number
  approvedCount: number
  refundedCount: number
  pendingCount: number
  refusedCount: number
  totalRevenue: number
  netRevenue: number
  ticketMedio: number
  approvalRate: number
  refundRate: number
  byMethod: Record<string, KiwifyMethodBreakdown>
  dailySales: KiwifyDailySale[]
  byProduct: Record<string, KiwifyProductBreakdown>
}

export interface KiwifySalesResponse {
  available: boolean
  current: KiwifyPeriodData
  previous: KiwifyPeriodData
  ranges: { current: { since: string; until: string }; previous: { since: string; until: string } }
  balance: { available: number; pending: number } | null
}

export async function fetchKiwifySales(days = 30): Promise<KiwifySalesResponse> {
  return apiFetch<KiwifySalesResponse>(`/api/kiwify/sales?days=${days}`)
}

// =============================================
// GOOGLE ADS API
// =============================================

export interface GAdsAccount {
  id: string
  name: string
  currency: string
  status: string
}

export interface GAdsCampaign {
  id: string
  name: string
  status: string
  type: string
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  spend: number
  conversions: number
  revenue: number
  cpa: number
  convRate: number
  impressionShare: number
  topImprShare: number
  absTopImprShare: number
}

export interface GAdsSearchTerm {
  term: string
  campaign: string
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  spend: number
  conversions: number
}

export interface GAdsDevice {
  device: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  revenue: number
  ctr: number
  cpc: number
  convRate: number
  cpa: number
}

export interface GAdsHourly {
  hour: number
  impressions: number
  clicks: number
  spend: number
  conversions: number
  ctr: number
  cpc: number
}

export interface GAdsTotals {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
  convRate: number
  avgQualityScore: number | null
}

export interface GAdsCampaignsResponse {
  campaigns: GAdsCampaign[]
  totals: GAdsTotals
  prevTotals: GAdsTotals
  ranges: { current: { since: string; until: string }; previous: { since: string; until: string } }
}

export interface GAdsDaily {
  date: string
  spend: number
  clicks: number
  impressions: number
  conversions: number
}

export interface GAdsKeyword {
  keyword: string
  matchType: string
  qualityScore: number | null
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  spend: number
  conversions: number
}

export async function fetchGAdsAccounts(): Promise<GAdsAccount[]> {
  const data = await apiFetch<{ accounts: GAdsAccount[] }>('/api/google-ads/accounts')
  return data.accounts || []
}

function dateParams(days: number, since?: string, until?: string): string {
  let q = `days=${days}`
  if (since && until) q += `&since=${since}&until=${until}`
  return q
}

export async function fetchGAdsCampaigns(customerId: string, days = 30, since?: string, until?: string): Promise<GAdsCampaignsResponse> {
  return apiFetch<GAdsCampaignsResponse>(`/api/google-ads/${customerId}/campaigns?${dateParams(days, since, until)}`)
}

export async function fetchGAdsDaily(customerId: string, days = 30, since?: string, until?: string): Promise<GAdsDaily[]> {
  const data = await apiFetch<{ daily: GAdsDaily[] }>(`/api/google-ads/${customerId}/daily?${dateParams(days, since, until)}`)
  return data.daily || []
}

export async function fetchGAdsKeywords(customerId: string, days = 30, since?: string, until?: string): Promise<GAdsKeyword[]> {
  const data = await apiFetch<{ keywords: GAdsKeyword[] }>(`/api/google-ads/${customerId}/keywords?${dateParams(days, since, until)}`)
  return data.keywords || []
}

export async function fetchGAdsSearchTerms(customerId: string, days = 30, since?: string, until?: string): Promise<GAdsSearchTerm[]> {
  const data = await apiFetch<{ searchTerms: GAdsSearchTerm[] }>(`/api/google-ads/${customerId}/search-terms?${dateParams(days, since, until)}`)
  return data.searchTerms || []
}

export async function fetchGAdsDevices(customerId: string, days = 30, since?: string, until?: string): Promise<GAdsDevice[]> {
  const data = await apiFetch<{ devices: GAdsDevice[] }>(`/api/google-ads/${customerId}/devices?${dateParams(days, since, until)}`)
  return data.devices || []
}

export async function fetchGAdsHourly(customerId: string, days = 30, since?: string, until?: string): Promise<GAdsHourly[]> {
  const data = await apiFetch<{ hourly: GAdsHourly[] }>(`/api/google-ads/${customerId}/hourly?${dateParams(days, since, until)}`)
  return data.hourly || []
}

export interface GAdsConversionAction { name: string; category: string; conversions: number; value: number; cost: number }
export async function fetchGAdsConversions(customerId: string, days = 30, since?: string, until?: string): Promise<GAdsConversionAction[]> {
  const data = await apiFetch<{ actions: GAdsConversionAction[] }>(`/api/google-ads/${customerId}/conversions?${dateParams(days, since, until)}`)
  return data.actions || []
}

// =============================================
// GOOGLE ANALYTICS 4
// =============================================

export interface GA4Property {
  id: string
  name: string
}

export interface GA4KPIs {
  sessions: number
  users: number
  newUsers: number
  pageviews: number
  avgDuration: number
  bounceRate: number
  engagedSessions: number
  engagementRate: number
  conversions: number
  events: number
  pagesPerSession: number
}

export interface GA4SourceMedium {
  sourceMedium: string
  sessions: number
  users: number
  newUsers: number
  engagementRate: number
  conversions: number
  bounceRate: number
}

export interface GA4LandingPage {
  page: string
  sessions: number
  users: number
  engagementRate: number
  bounceRate: number
  conversions: number
  avgDuration: number
}

export interface GA4NewVsReturning {
  type: string
  sessions: number
  users: number
  engagementRate: number
  bounceRate: number
  avgDuration: number
  conversions: number
  pageviews: number
}

export interface GA4Event {
  name: string
  count: number
  users: number
}

export interface GA4DayOfWeek {
  day: string
  sessions: number
  users: number
  conversions: number
  engagementRate: number
}

export interface GA4City {
  city: string
  sessions: number
  users: number
  conversions: number
}

export interface GA4Daily {
  date: string
  sessions: number
  users: number
  pageviews: number
  conversions: number
}

export interface GA4Source {
  channel: string
  sessions: number
  users: number
  conversions: number
  engaged: number
}

export interface GA4Page {
  path: string
  pageviews: number
  sessions: number
  avgDuration: number
  bounceRate: number
}

export interface GA4Device {
  device: string
  sessions: number
  users: number
  conversions: number
  bounceRate: number
  avgDuration: number
}

export interface GA4Report {
  current: GA4KPIs
  previous: GA4KPIs
  daily: GA4Daily[]
  sources: GA4Source[]
  pages: GA4Page[]
  devices: GA4Device[]
  sourceMedium: GA4SourceMedium[]
  landingPages: GA4LandingPage[]
  newVsReturning: GA4NewVsReturning[]
  events: GA4Event[]
  dayOfWeek: GA4DayOfWeek[]
  cities: GA4City[]
}

export async function fetchGA4Properties(accountName: string): Promise<{ available: boolean; properties: GA4Property[] }> {
  return apiFetch(`/api/analytics/properties?name=${encodeURIComponent(accountName)}`)
}

export async function fetchGA4Report(propertyId: string, days = 7, since?: string, until?: string): Promise<GA4Report> {
  return apiFetch<GA4Report>(`/api/analytics/${propertyId}/report?${dateParams(days, since, until)}`)
}

// =============================================
// OVERVIEW (AGGREGATED)
// =============================================

export interface OverviewData {
  sources: {
    meta?: { spend: number; prevSpend: number; impressions: number; reach: number; clicks: number; leads: number; prevLeads: number; messaging: number; prevMessaging: number; purchases: number; linkClicks: number }
    gads?: { spend: number; prevSpend: number; clicks: number; impressions: number; conversions: number; prevConversions: number; revenue: number }
    ga4?: { sessions: number; prevSessions: number; users: number; prevUsers: number; pageviews: number; bounceRate: number; engagementRate: number; conversions: number; daily: { date: string; sessions: number }[] }
    instagram?: { followers: number; reach: number; interactions: number; username: string }
    kiwify?: { sales: number; prevSales: number; revenue: number; prevRevenue: number }
    crm?: { available: boolean; crmType: string; qualSim: number; qualNao: number; qualMeio: number; crmTotal: number }
  }
  metaDaily?: { date: string; spend: number; leads: number }[]
  totals: {
    spend: number; prevSpend: number; leads: number; prevLeads: number
    metaConversions: number; prevMetaConversions: number; gadsConversions: number; prevGadsConversions: number
    sessions: number; prevSessions: number; revenue: number; prevRevenue: number
    cpl: number; prevCpl: number; roas: number
  }
  alerts: { type: string; text: string }[]
}

export async function fetchOverview(accountId: string, accountName: string, days = 7, since?: string, until?: string): Promise<OverviewData> {
  let url = `/api/overview/${accountId}?name=${encodeURIComponent(accountName)}&days=${days}`
  if (since && until) url += `&since=${since}&until=${until}`
  return apiFetch<OverviewData>(url)
}
