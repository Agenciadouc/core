// Dashboard publico — sem login, escopado por slug.
// Rota: /core/public/:slug

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Calendar } from 'lucide-react'
import { fetchPublicDashboard, DEFAULT_CONFIG, type DashboardConfig } from '../lib/dashboardConfig'
import { type MetaInsight, type CompareResponse, type DailyCompareResponse, DAYS_MAP } from '../lib/api'
import MetricCards from '../components/MetricCards'
import SpendChart from '../components/SpendChart'
import FunnelChart from '../components/FunnelChart'
import CampaignTree from '../components/CampaignTree'
import TopCreatives from '../components/TopCreatives'

const API_BASE = import.meta.env.DEV ? '' : '/core'
const DATE_OPTIONS = [
  { label: '7 dias', value: '7d' },
  { label: '14 dias', value: '14d' },
  { label: '30 dias', value: '30d' },
  { label: '90 dias', value: '90d' },
  { label: 'Personalizado', value: 'custom' },
]

async function pubFetch<T>(slug: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}/api/public/dashboard/${slug}${path}`, window.location.origin)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Erro ${res.status}`)
  return res.json()
}

export default function PublicDashboard() {
  const { slug = '' } = useParams()
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  const [datePeriod, setDatePeriod] = useState('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const [compareData, setCompareData] = useState<CompareResponse | null>(null)
  const [campaignCompare, setCampaignCompare] = useState<CompareResponse | null>(null)
  const [dailyCompare, setDailyCompare] = useState<DailyCompareResponse | null>(null)
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    setLoading(true); setNotFound(false)
    fetchPublicDashboard(slug)
      .then(d => { setConfig(d.config); setAccountId(d.account_id); setLastUpdate(d.last_update) })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  const getEffectiveDays = () => {
    if (datePeriod === 'custom' && customFrom && customTo) {
      const diff = Math.ceil((new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86400000) + 1
      return Math.max(diff, 1)
    }
    return DAYS_MAP[datePeriod] || 30
  }

  useEffect(() => {
    if (!accountId) return
    if (datePeriod === 'custom' && (!customFrom || !customTo)) return
    setLoadingData(true)
    const days = String(getEffectiveDays())
    const params: Record<string, string> = { days }
    if (datePeriod === 'custom') { params.since = customFrom; params.until = customTo }

    Promise.all([
      pubFetch<CompareResponse>(slug, '/insights/compare', { ...params, level: 'account' }).catch(() => null),
      pubFetch<CompareResponse>(slug, '/insights/compare', { ...params, level: 'campaign' }).catch(() => null),
      pubFetch<DailyCompareResponse>(slug, '/insights/daily-compare', params).catch(() => null),
    ])
      .then(([acct, camp, daily]) => { setCompareData(acct); setCampaignCompare(camp); setDailyCompare(daily) })
      .finally(() => setLoadingData(false))
  }, [accountId, datePeriod, customFrom, customTo, slug])

  const formatSyncAgo = (isoOrDatetime: string | null) => {
    if (!isoOrDatetime) return 'nunca'
    const t = new Date(isoOrDatetime.replace(' ', 'T') + 'Z').getTime()
    const diffMin = Math.round((Date.now() - t) / 60000)
    if (diffMin < 60) return `ha ${diffMin} min`
    const diffH = Math.round(diffMin / 60)
    if (diffH < 48) return `ha ${diffH}h`
    return `ha ${Math.round(diffH / 24)}d`
  }

  if (loading) return <div className="loading-container" style={{ height: '100vh' }}><Loader2 size={20} className="spin" /> Carregando dashboard...</div>
  if (notFound) return <div className="empty-state" style={{ height: '100vh' }}><div className="icon">🔒</div><h3>Link nao encontrado</h3><p>Este link publico foi removido ou expirou.</p></div>
  if (!accountId) return null

  const current = compareData?.current?.[0] || null
  const previous = compareData?.previous?.[0] || null

  return (
    <div className="public-dashboard">
      <div className="public-header">
        <div>
          <div className="public-tag">Dashboard de Performance</div>
          <div className="public-source">Meta Ads · coletado {formatSyncAgo(lastUpdate)}</div>
        </div>
        <img src={`${import.meta.env.BASE_URL}logo-dros.png`} alt="Dros" style={{ height: 30 }} />
      </div>

      <div className="date-bar" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="date-selector">
          {DATE_OPTIONS.map(opt => (
            <button key={opt.value} className={`date-btn ${datePeriod === opt.value ? 'active' : ''}`} onClick={() => { setDatePeriod(opt.value); setShowCustom(opt.value === 'custom') }}>
              {opt.value === 'custom' ? <><Calendar size={11} /> {opt.label}</> : opt.label}
            </button>
          ))}
        </div>
        {showCustom && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="input" style={{ padding: '6px 10px', fontSize: 12 }} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="input" style={{ padding: '6px 10px', fontSize: 12 }} />
          </div>
        )}
      </div>

      {loadingData ? (
        <div className="loading-container"><Loader2 size={18} className="spin" /> Carregando dados...</div>
      ) : !current ? (
        <div className="empty-state"><div className="icon">📭</div><h3>Sem dados no periodo</h3></div>
      ) : (
        <>
          <section className="dash-section"><MetricCards current={current as MetaInsight} previous={previous as MetaInsight | null} cards={config.cards} /></section>
          <section className="dash-section"><div className="chart-card"><SpendChart currentData={dailyCompare?.current || []} previousData={dailyCompare?.previous || []} defaultMetric={config.chartDefaultMetric} availableMetrics={config.chartAvailableMetrics} /></div></section>
          <section className="dash-section"><div className="chart-card"><h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Funil</h3><FunnelChart insight={current as MetaInsight} steps={config.funnel} /></div></section>
          <section className="dash-section"><div className="table-card"><div className="table-header"><h3>Campanhas</h3></div><CampaignTree currentCampaigns={campaignCompare?.current || []} days={getEffectiveDays()} since={datePeriod === 'custom' ? customFrom : undefined} until={datePeriod === 'custom' ? customTo : undefined} columns={config.table} /></div></section>
          <section className="dash-section"><div className="table-card"><div className="table-header"><h3>Top Criativos</h3></div><TopCreatives accountId={accountId} days={getEffectiveDays()} since={datePeriod === 'custom' ? customFrom : undefined} until={datePeriod === 'custom' ? customTo : undefined} defaultSort={config.topCreativesSort} /></div></section>
        </>
      )}

      <div className="public-footer">
        <img src={`${import.meta.env.BASE_URL}logo-dros.png`} alt="Dros" style={{ height: 24 }} />
        <span>Dashboard mantido pela agencia</span>
      </div>
    </div>
  )
}
