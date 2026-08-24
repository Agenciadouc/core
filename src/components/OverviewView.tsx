// Overview repaginado — usa MetricCards + FunnelChart (mesmo visual das outras abas).
// Agrega dados de Meta + Google Ads + Instagram + GA4 + CRM + Kiwify no mesmo card.

import { useState, useEffect } from 'react'
import { fetchOverview, formatBRL, formatNumber, pctChange, type OverviewData } from '../lib/api'
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Users, Target, Eye, MousePointerClick, MessageCircle, ShoppingCart, Globe, Instagram, BarChart3, Zap, PackagePlus, AlertTriangle } from 'lucide-react'
import { clearApiCache } from '../lib/dashboardConfig'
import type { ComponentType } from 'react'

interface Props {
  accountId: string
  accountName: string
  days: number
  since?: string
  until?: string
}

// Cor + icone por metrica do Overview
const OV_VISUALS: Record<string, { icon: ComponentType<{ size?: number }>; color: string }> = {
  spend_total:     { icon: DollarSign,        color: '#EA4335' },
  spend_meta:      { icon: DollarSign,        color: '#1877F2' },
  spend_gads:      { icon: DollarSign,        color: '#4285F4' },
  impressions:     { icon: Eye,               color: '#FFAA83' },
  reach:           { icon: Users,             color: '#9B59B6' },
  clicks:          { icon: MousePointerClick, color: '#5DADE2' },
  ctr:             { icon: Target,            color: '#FFB70F' },
  conversions:     { icon: Target,            color: '#34C759' },
  messaging:       { icon: MessageCircle,     color: '#25D366' },
  leads:           { icon: PackagePlus,       color: '#34A853' },
  purchases:       { icon: ShoppingCart,      color: '#34C759' },
  revenue:         { icon: DollarSign,        color: '#34C759' },
  roas:            { icon: TrendingUp,        color: '#34C759' },
  cpl:             { icon: Target,            color: '#FFAA83' },
  cost_per_purchase: { icon: Target,          color: '#FF6B6B' },
  sessions:        { icon: Globe,             color: '#9B59B6' },
  users:           { icon: Users,             color: '#9B59B6' },
  ig_followers:    { icon: Instagram,         color: '#E1306C' },
  ig_reach:        { icon: Eye,               color: '#E1306C' },
  ig_interactions: { icon: Zap,               color: '#F77737' },
  qual_sim:        { icon: Target,            color: '#34C759' },
  qual_nao:        { icon: TrendingDown,      color: '#FF6B6B' },
}

function Card({ label, value, sub, change, icon, color }: {
  label: string; value: string; sub?: string; change?: number | null;
  icon: ComponentType<{ size?: number }>; color: string
}) {
  const Icon = icon
  const isPos = change !== null && change !== undefined && change >= 0
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon" style={{ background: `${color}20`, color }}>
          <Icon size={14} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
      {(change !== null && change !== undefined) || sub ? (
        <div className="metric-sub">
          {change !== null && change !== undefined && (
            <span className={isPos ? 'positive' : 'negative'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {isPos ? '+' : ''}{change.toFixed(1)}%
            </span>
          )}
          {sub && <span style={{ marginLeft: change !== null && change !== undefined ? 6 : 0, color: 'var(--text-muted)' }}>{sub}</span>}
        </div>
      ) : null}
    </div>
  )
}

// Funil no visual novo (centralizado, barras coloridas)
const FUNNEL_COLORS = [
  'linear-gradient(90deg, #FF6B8A 0%, #FF5378 100%)',
  'linear-gradient(90deg, #FFAA83 0%, #FF9066 100%)',
  'linear-gradient(90deg, #9B59B6 0%, #8548A3 100%)',
  'linear-gradient(90deg, #5DADE2 0%, #3F97CE 100%)',
  'linear-gradient(90deg, #34C759 0%, #22A946 100%)',
  'linear-gradient(90deg, #FFB300 0%, #E69C00 100%)',
]

function Funnel({ steps }: { steps: { name: string; value: number }[] }) {
  if (steps.length < 2) return <div style={{ color: 'var(--text-muted)', padding: 30, textAlign: 'center' }}>Dados insuficientes pro funil</div>
  const max = Math.max(...steps.map(s => s.value))
  if (max === 0) return <div style={{ color: 'var(--text-muted)', padding: 30, textAlign: 'center' }}>Sem dados no periodo</div>
  const MIN = 28
  return (
    <div className="funnel-classic">
      {steps.map((s, i) => {
        const ratio = s.value / max
        const width = MIN + (100 - MIN) * ratio
        const prev = i > 0 ? steps[i - 1] : null
        const conv = prev && prev.value > 0 ? (s.value / prev.value) * 100 : null
        return (
          <div key={s.name} className="funnel-classic-row">
            <div className="funnel-classic-bar-wrapper" style={{ width: `${width}%` }}>
              <div className="funnel-classic-bar" style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length], color: '#fff' }}>
                <div className="funnel-classic-label">{s.name}</div>
                <div className="funnel-classic-value">{formatNumber(s.value)}</div>
              </div>
            </div>
            {conv !== null && <div className="funnel-classic-rate">{conv.toFixed(1)}%</div>}
          </div>
        )
      })}
    </div>
  )
}

export default function OverviewView({ accountId, accountName, days, since, until }: Props) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [cacheMeta, setCacheMeta] = useState<{ from?: string; updated?: string } | null>(null)

  const load = () => {
    setLoading(true)
    fetchOverview(accountId, accountName, days, since, until)
      .then(d => {
        setData(d)
        setCacheMeta((d as any)._cache_meta || null)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [accountId, accountName, days, since, until])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await clearApiCache('overview')
      load()
    } catch (e) { console.error(e) }
    setSyncing(false)
  }

  const formatSyncAgo = (u: string | undefined) => {
    if (!u) return 'agora'
    const t = new Date(u.replace(' ', 'T') + 'Z').getTime()
    const diffMin = Math.round((Date.now() - t) / 60000)
    if (diffMin < 1) return 'agora'
    if (diffMin < 60) return `ha ${diffMin} min`
    const diffH = Math.round(diffMin / 60)
    return `ha ${diffH}h`
  }

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Carregando visao geral...</span></div>
  if (!data) return <div className="empty-state"><div className="icon">📊</div><h3>Sem dados disponiveis</h3></div>

  const t = data.totals
  const s = data.sources
  const hasMeta = !!s.meta
  const hasGads = !!s.gads
  const hasGA4 = !!s.ga4
  const hasIG = !!s.instagram
  const hasKiwify = !!s.kiwify
  const hasCRM = !!s.crm && (s.crm.qualSim || s.crm.qualNao || s.crm.qualMeio)

  // Totais unificados
  const totalSpend = t.spend || 0
  const totalPrevSpend = t.prevSpend || 0
  const totalImpressions = (s.meta?.impressions || 0) + (s.gads?.impressions || 0)
  const totalClicks = (s.meta?.clicks || 0) + (s.gads?.clicks || 0)
  const totalConversions = (t.metaConversions || 0) + (t.gadsConversions || 0)
  const totalPrevConversions = (t.prevMetaConversions || 0) + (t.prevGadsConversions || 0)
  const totalRevenue = (s.kiwify?.revenue || 0) + (s.gads?.revenue || 0)
  const roasUnified = totalSpend > 0 ? totalRevenue / totalSpend : 0
  const cplUnified = totalConversions > 0 ? totalSpend / totalConversions : 0

  // Funil unificado
  const funnelSteps: { name: string; value: number }[] = [
    { name: 'Impressoes', value: totalImpressions },
    { name: 'Cliques', value: totalClicks },
  ]
  if (hasGA4 && s.ga4!.sessions > 0) funnelSteps.push({ name: 'Sessoes site', value: s.ga4!.sessions })
  if (totalConversions > 0) funnelSteps.push({ name: 'Conversoes', value: Math.round(totalConversions) })
  if (hasKiwify && s.kiwify!.sales > 0) funnelSteps.push({ name: 'Vendas', value: s.kiwify!.sales })

  return (
    <div>
      {/* Toolbar */}
      <div className="ads-toolbar">
        <div className="ads-toolbar-meta">
          <span className="meta-source">Geral</span>
          <span className="meta-sep">·</span>
          <span className="meta-collected">
            {cacheMeta?.from === 'cache' ? `coletado ${formatSyncAgo(cacheMeta.updated)}`
              : cacheMeta?.from === 'stale' ? `cache stale ${formatSyncAgo(cacheMeta.updated)}`
              : 'atualizado agora'}
          </span>
        </div>
        <div className="ads-toolbar-actions">
          <button className="btn-tool" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={13} className={syncing ? 'spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* Alertas */}
      {data.alerts?.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: a.type === 'danger' ? 'rgba(234,67,53,0.1)' : 'rgba(251,188,4,0.1)',
              border: `1px solid ${a.type === 'danger' ? 'rgba(234,67,53,0.2)' : 'rgba(251,188,4,0.2)'}`,
              color: a.type === 'danger' ? '#EA4335' : '#FBBC04',
            }}>
              <AlertTriangle size={14} /> {a.text}
            </div>
          ))}
        </div>
      )}

      {/* Cards Unificados (soma de tudo) */}
      <section className="dash-section">
        <div className="section-title">Resultado unificado</div>
        <div className="metrics-grid">
          {totalSpend > 0 && (
            <Card label="Investimento total" value={formatBRL(totalSpend)} icon={OV_VISUALS.spend_total.icon} color={OV_VISUALS.spend_total.color}
              change={totalPrevSpend > 0 ? pctChange(totalSpend, totalPrevSpend) : null}
              sub={hasMeta && hasGads ? 'Meta + Google' : hasMeta ? 'Meta Ads' : hasGads ? 'Google Ads' : ''} />
          )}
          {totalImpressions > 0 && (
            <Card label="Impressoes" value={formatNumber(totalImpressions)} icon={OV_VISUALS.impressions.icon} color={OV_VISUALS.impressions.color} />
          )}
          {totalClicks > 0 && (
            <Card label="Cliques" value={formatNumber(totalClicks)} icon={OV_VISUALS.clicks.icon} color={OV_VISUALS.clicks.color} />
          )}
          {totalConversions > 0 && (
            <Card label="Conversoes" value={formatNumber(totalConversions)} icon={OV_VISUALS.conversions.icon} color={OV_VISUALS.conversions.color}
              change={totalPrevConversions > 0 ? pctChange(totalConversions, totalPrevConversions) : null}
              sub={hasMeta && hasGads ? 'Meta + Google' : ''} />
          )}
          {cplUnified > 0 && (
            <Card label="Custo/conversao" value={formatBRL(cplUnified)} icon={OV_VISUALS.cpl.icon} color={OV_VISUALS.cpl.color} />
          )}
          {totalRevenue > 0 && (
            <Card label="Receita" value={formatBRL(totalRevenue)} icon={OV_VISUALS.revenue.icon} color={OV_VISUALS.revenue.color} />
          )}
          {roasUnified > 0 && (
            <Card label="ROAS" value={`${roasUnified.toFixed(2)}x`} icon={OV_VISUALS.roas.icon} color={roasUnified >= 2 ? '#34A853' : roasUnified >= 1 ? '#FBBC04' : '#EA4335'}
              sub={roasUnified >= 2 ? 'saudavel' : roasUnified >= 1 ? 'no limite' : 'negativo'} />
          )}
          {hasGA4 && s.ga4!.sessions > 0 && (
            <Card label="Sessoes site" value={formatNumber(s.ga4!.sessions)} icon={OV_VISUALS.sessions.icon} color={OV_VISUALS.sessions.color}
              change={s.ga4!.prevSessions > 0 ? pctChange(s.ga4!.sessions, s.ga4!.prevSessions) : null} />
          )}
        </div>
      </section>

      {/* Funil unificado */}
      {funnelSteps.length >= 2 && (
        <section className="dash-section">
          <div className="section-title">Funil de conversao (todas as origens)</div>
          <div className="chart-card">
            <Funnel steps={funnelSteps} />
          </div>
        </section>
      )}

      {/* CRM cards */}
      {hasCRM && (
        <section className="dash-section">
          <div className="section-title">Qualificacao do CRM</div>
          <div className="metrics-grid">
            {s.crm!.qualSim > 0 && (
              <Card label="Qualificados" value={formatNumber(s.crm!.qualSim)} icon={OV_VISUALS.qual_sim.icon} color={OV_VISUALS.qual_sim.color}
                sub={s.crm!.crmTotal > 0 ? `${((s.crm!.qualSim / s.crm!.crmTotal) * 100).toFixed(0)}% dos leads` : ''} />
            )}
            {s.crm!.qualNao > 0 && (
              <Card label="Desqualificados" value={formatNumber(s.crm!.qualNao)} icon={OV_VISUALS.qual_nao.icon} color={OV_VISUALS.qual_nao.color}
                sub={s.crm!.crmTotal > 0 ? `${((s.crm!.qualNao / s.crm!.crmTotal) * 100).toFixed(0)}% dos leads` : ''} />
            )}
            {s.crm!.qualMeio > 0 && (
              <Card label="Sem qualificacao" value={formatNumber(s.crm!.qualMeio)} icon={OV_VISUALS.qual_nao.icon} color="#9B96B0"
                sub={s.crm!.crmTotal > 0 ? `${((s.crm!.qualMeio / s.crm!.crmTotal) * 100).toFixed(0)}% pendentes` : ''} />
            )}
            {s.crm!.qualSim > 0 && totalSpend > 0 && (
              <Card label="CPL real qualificado" value={formatBRL(totalSpend / s.crm!.qualSim)} icon={OV_VISUALS.cpl.icon} color="#FFAA83" sub="Investido / leads qualificados" />
            )}
          </div>
        </section>
      )}

      {/* Resumos por plataforma */}
      {hasMeta && (
        <section className="dash-section">
          <div className="section-title">Meta Ads</div>
          <div className="metrics-grid">
            <Card label="Investimento" value={formatBRL(s.meta!.spend)} icon={OV_VISUALS.spend_meta.icon} color={OV_VISUALS.spend_meta.color} />
            <Card label="Alcance" value={formatNumber(s.meta!.reach)} icon={OV_VISUALS.reach.icon} color={OV_VISUALS.reach.color} />
            <Card label="Cliques link" value={formatNumber(s.meta!.linkClicks || s.meta!.clicks)} icon={OV_VISUALS.clicks.icon} color={OV_VISUALS.clicks.color} />
            {s.meta!.messaging > 0 && (
              <Card label="Conversas" value={formatNumber(s.meta!.messaging)} icon={OV_VISUALS.messaging.icon} color={OV_VISUALS.messaging.color}
                change={s.meta!.prevMessaging > 0 ? pctChange(s.meta!.messaging, s.meta!.prevMessaging) : null} />
            )}
            {s.meta!.leads > 0 && (
              <Card label="Leads form" value={formatNumber(s.meta!.leads)} icon={OV_VISUALS.leads.icon} color={OV_VISUALS.leads.color}
                change={s.meta!.prevLeads > 0 ? pctChange(s.meta!.leads, s.meta!.prevLeads) : null} />
            )}
            {s.meta!.purchases > 0 && (
              <Card label="Vendas Meta" value={formatNumber(s.meta!.purchases)} icon={OV_VISUALS.purchases.icon} color={OV_VISUALS.purchases.color} />
            )}
          </div>
        </section>
      )}

      {hasGads && (
        <section className="dash-section">
          <div className="section-title">Google Ads</div>
          <div className="metrics-grid">
            <Card label="Investimento" value={formatBRL(s.gads!.spend)} icon={OV_VISUALS.spend_gads.icon} color={OV_VISUALS.spend_gads.color} />
            <Card label="Impressoes" value={formatNumber(s.gads!.impressions)} icon={OV_VISUALS.impressions.icon} color={OV_VISUALS.impressions.color} />
            <Card label="Cliques" value={formatNumber(s.gads!.clicks)} icon={OV_VISUALS.clicks.icon} color={OV_VISUALS.clicks.color} />
            <Card label="Conversoes" value={s.gads!.conversions.toFixed(0)} icon={OV_VISUALS.conversions.icon} color={OV_VISUALS.conversions.color}
              change={s.gads!.prevConversions > 0 ? pctChange(s.gads!.conversions, s.gads!.prevConversions) : null} />
            {s.gads!.revenue > 0 && (
              <Card label="Receita" value={formatBRL(s.gads!.revenue)} icon={OV_VISUALS.revenue.icon} color={OV_VISUALS.revenue.color} />
            )}
          </div>
        </section>
      )}

      {hasGA4 && (
        <section className="dash-section">
          <div className="section-title">Site (Analytics)</div>
          <div className="metrics-grid">
            <Card label="Sessoes" value={formatNumber(s.ga4!.sessions)} icon={OV_VISUALS.sessions.icon} color={OV_VISUALS.sessions.color}
              change={s.ga4!.prevSessions > 0 ? pctChange(s.ga4!.sessions, s.ga4!.prevSessions) : null} />
            <Card label="Usuarios" value={formatNumber(s.ga4!.users)} icon={OV_VISUALS.users.icon} color={OV_VISUALS.users.color}
              change={s.ga4!.prevUsers > 0 ? pctChange(s.ga4!.users, s.ga4!.prevUsers) : null} />
            <Card label="Engajamento" value={`${s.ga4!.engagementRate.toFixed(1)}%`} icon={OV_VISUALS.ctr.icon} color={OV_VISUALS.ctr.color} />
            <Card label="Rejeicao" value={`${s.ga4!.bounceRate.toFixed(1)}%`} icon={OV_VISUALS.qual_nao.icon} color={s.ga4!.bounceRate > 60 ? '#EA4335' : '#34A853'} />
          </div>
        </section>
      )}

      {hasIG && (
        <section className="dash-section">
          <div className="section-title">Instagram — @{s.instagram!.username}</div>
          <div className="metrics-grid">
            <Card label="Seguidores" value={formatNumber(s.instagram!.followers)} icon={OV_VISUALS.ig_followers.icon} color={OV_VISUALS.ig_followers.color} />
            <Card label="Alcance" value={formatNumber(s.instagram!.reach)} icon={OV_VISUALS.ig_reach.icon} color={OV_VISUALS.ig_reach.color} />
            <Card label="Interacoes" value={formatNumber(s.instagram!.interactions)} icon={OV_VISUALS.ig_interactions.icon} color={OV_VISUALS.ig_interactions.color} />
            {s.instagram!.reach > 0 && (
              <Card label="Taxa engajamento" value={`${((s.instagram!.interactions / s.instagram!.reach) * 100).toFixed(2)}%`} icon={OV_VISUALS.ctr.icon} color={OV_VISUALS.ctr.color} />
            )}
          </div>
        </section>
      )}
    </div>
  )
}
