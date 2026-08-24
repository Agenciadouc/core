// Overview totalmente configuravel — mesmo padrao da tab Meta.
// Toolbar (Sincronizar/Personalizar) + cards/funil/grafico configuraveis via OverviewMetricPicker.
// ConversionActionsPicker pra escolher quais action_types Meta + conversion_actions Google contam.

import { useState, useEffect } from 'react'
import { fetchOverview, formatBRL, formatNumber, type OverviewData } from '../lib/api'
import { RefreshCw, Settings2, Check, X, TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick, Target, ShoppingCart, MessageCircle, Users, Instagram, Globe, PackagePlus, Zap, Radio, CreditCard, FileText, AlertTriangle } from 'lucide-react'
import { clearApiCache, saveDashboardConfig, fetchDashboardConfig, type DashboardConfig, DEFAULT_CONFIG } from '../lib/dashboardConfig'
import { getOverviewMetric, OVERVIEW_METRICS_BY_KEY } from '../lib/overviewMetricsCatalog'
import OverviewMetricPicker from './OverviewMetricPicker'
import ConversionActionsPicker from './ConversionActionsPicker'
import type { ComponentType } from 'react'

interface Props {
  accountId: string
  accountName: string
  days: number
  since?: string
  until?: string
}

// Visual (icone + cor) por metric-key do Overview — cobertura das mais comuns
const VISUALS: Record<string, { icon: ComponentType<{ size?: number }>; color: string }> = {
  'unified.spend':        { icon: DollarSign,        color: '#EA4335' },
  'unified.impressions':  { icon: Eye,               color: '#FFAA83' },
  'unified.clicks':       { icon: MousePointerClick, color: '#5DADE2' },
  'unified.ctr':          { icon: Target,            color: '#FFB70F' },
  'unified.conversions':  { icon: Target,            color: '#34C759' },
  'unified.cpl':          { icon: Target,            color: '#FFAA83' },
  'unified.revenue':      { icon: DollarSign,        color: '#34C759' },
  'unified.roas':         { icon: TrendingUp,        color: '#34C759' },
  'meta.spend':           { icon: DollarSign,        color: '#1877F2' },
  'meta.impressions':     { icon: Eye,               color: '#1877F2' },
  'meta.reach':           { icon: Radio,             color: '#1877F2' },
  'meta.clicks':          { icon: MousePointerClick, color: '#1877F2' },
  'meta.messaging':       { icon: MessageCircle,     color: '#25D366' },
  'meta.leads':           { icon: PackagePlus,       color: '#34A853' },
  'meta.purchases':       { icon: ShoppingCart,      color: '#34C759' },
  'meta.conversions':     { icon: Target,            color: '#1877F2' },
  'gads.spend':           { icon: DollarSign,        color: '#4285F4' },
  'gads.impressions':     { icon: Eye,               color: '#4285F4' },
  'gads.clicks':          { icon: MousePointerClick, color: '#4285F4' },
  'gads.conversions':     { icon: Target,            color: '#34A853' },
  'gads.revenue':         { icon: CreditCard,        color: '#34A853' },
  'gads.cpa':             { icon: Target,            color: '#FFAA83' },
  'ga4.sessions':         { icon: Globe,             color: '#9B59B6' },
  'ga4.users':            { icon: Users,             color: '#9B59B6' },
  'ga4.engagement_rate':  { icon: Zap,               color: '#F77737' },
  'ga4.bounce_rate':      { icon: TrendingDown,      color: '#FF6B6B' },
  'ig.followers':         { icon: Instagram,         color: '#E1306C' },
  'ig.reach':             { icon: Eye,               color: '#E1306C' },
  'ig.interactions':      { icon: Zap,               color: '#F77737' },
  'ig.engagement':        { icon: Target,            color: '#F77737' },
  'crm.qual_sim':         { icon: Target,            color: '#34C759' },
  'crm.qual_nao':         { icon: TrendingDown,      color: '#FF6B6B' },
  'crm.qual_meio':        { icon: FileText,          color: '#9B96B0' },
  'crm.total':            { icon: PackagePlus,       color: '#5DADE2' },
  'crm.qual_rate':        { icon: Target,            color: '#34C759' },
  'kiwify.sales':         { icon: ShoppingCart,      color: '#FFB300' },
  'kiwify.revenue':       { icon: DollarSign,        color: '#FFB300' },
}
const DEFAULT_VISUAL = { icon: Target, color: '#9B96B0' }

function Card({ metricKey, value }: { metricKey: string; value: string }) {
  const def = getOverviewMetric(metricKey)
  if (!def) return null
  const v = VISUALS[metricKey] || DEFAULT_VISUAL
  const Icon = v.icon
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{def.label}</span>
        <div className="metric-icon" style={{ background: `${v.color}20`, color: v.color }}>
          <Icon size={14} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
    </div>
  )
}

const FUNNEL_COLORS = [
  'linear-gradient(90deg, #FF6B8A 0%, #FF5378 100%)',
  'linear-gradient(90deg, #FFAA83 0%, #FF9066 100%)',
  'linear-gradient(90deg, #9B59B6 0%, #8548A3 100%)',
  'linear-gradient(90deg, #5DADE2 0%, #3F97CE 100%)',
  'linear-gradient(90deg, #34C759 0%, #22A946 100%)',
  'linear-gradient(90deg, #FFB300 0%, #E69C00 100%)',
]

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  if (steps.length < 2) return <div style={{ padding: 30, color: 'var(--text-muted)', textAlign: 'center' }}>Configure ao menos 2 etapas do funil.</div>
  const max = Math.max(...steps.map(s => s.value))
  if (max === 0) return <div style={{ padding: 30, color: 'var(--text-muted)', textAlign: 'center' }}>Sem dados no periodo</div>
  // Largura visual por posicao (nao por valor) — funil bonito garantido
  const MAX = 100, MIN = 40
  const step = steps.length > 1 ? (MAX - MIN) / (steps.length - 1) : 0
  return (
    <div className="funnel-classic">
      {steps.map((s, i) => {
        const width = MAX - (i * step)
        const prev = i > 0 ? steps[i - 1] : null
        const conv = prev && prev.value > 0 ? (s.value / prev.value) * 100 : null
        return (
          <div key={s.label} className="funnel-classic-row">
            <div className="funnel-classic-bar-wrapper" style={{ width: `${width}%` }}>
              <div className="funnel-classic-bar" style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length], color: '#fff' }}>
                <div className="funnel-classic-label">{s.label}</div>
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

  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG)
  const [editing, setEditing] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)

  // Descobrir se essa conta tem gads_customer_id — pra habilitar picker Google
  // (accountId aqui eh o meta account_id, precisamos consultar Hub via config carregada)
  const [gadsCustomerId, setGadsCustomerId] = useState<string | undefined>(undefined)

  useEffect(() => {
    setLoading(true)
    fetchOverview(accountId, accountName, days, since, until)
      .then(d => {
        setData(d)
        setCacheMeta((d as any)._cache_meta || null)
        // Extrai gads customer_id dos dados retornados
        if ((d.sources.gads as any)?.customerId) setGadsCustomerId((d.sources.gads as any).customerId)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [accountId, accountName, days, since, until])

  // Load config
  useEffect(() => {
    if (!accountId) return
    fetchDashboardConfig(accountId).then(r => setConfig(r.config)).catch(() => setConfig(DEFAULT_CONFIG))
  }, [accountId])

  const ovConfig = config.overview || DEFAULT_CONFIG.overview!
  const patchOverview = (patch: Partial<DashboardConfig['overview']>) => {
    setConfig(prev => ({ ...prev, overview: { ...(prev.overview || DEFAULT_CONFIG.overview!), ...patch } as any }))
  }

  const handleSaveConfig = async () => {
    setSavingCfg(true)
    try { await saveDashboardConfig(accountId, config); setEditing(false) }
    catch (e) { console.error(e); alert('Erro ao salvar personalizacao') }
    setSavingCfg(false)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await clearApiCache('all')
      const d = await fetchOverview(accountId, accountName, days, since, until)
      setData(d)
      setCacheMeta((d as any)._cache_meta || null)
    } catch (e) { console.error(e) }
    setSyncing(false)
  }

  const formatSyncAgo = (u: string | undefined) => {
    if (!u) return 'agora'
    const t = new Date(u.replace(' ', 'T') + 'Z').getTime()
    const diffMin = Math.round((Date.now() - t) / 60000)
    if (diffMin < 1) return 'agora'
    if (diffMin < 60) return `ha ${diffMin} min`
    return `ha ${Math.round(diffMin / 60)}h`
  }

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Carregando visao geral...</span></div>
  if (!data) return <div className="empty-state"><div className="icon">📊</div><h3>Sem dados disponiveis</h3></div>

  const cfgExtractCtx = {
    metaConversionActions: config.metaConversionActions,
    gadsConversionActionIds: ovConfig.gadsConversionActionIds,
  }

  // Renderiza cards baseado na config
  const renderCards = ovConfig.cards.map(key => {
    const def = getOverviewMetric(key)
    if (!def) return null
    const value = def.format(def.extract(data, cfgExtractCtx))
    return <Card key={key} metricKey={key} value={value} />
  }).filter(Boolean)

  // Funil steps baseado na config
  const funnelSteps = ovConfig.funnel.map(key => {
    const def = getOverviewMetric(key)
    if (!def) return null
    return { label: def.label, value: def.extract(data, cfgExtractCtx) }
  }).filter(Boolean) as { label: string; value: number }[]

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
          {editing ? (
            <>
              <button className="btn-tool btn-tool-primary" onClick={handleSaveConfig} disabled={savingCfg}>
                <Check size={13} /> {savingCfg ? 'Salvando...' : 'Concluir edicao'}
              </button>
              <button className="btn-tool btn-tool-ghost" onClick={() => { setEditing(false); fetchDashboardConfig(accountId).then(r => setConfig(r.config)) }}>
                <X size={13} /> Cancelar
              </button>
            </>
          ) : (
            <>
              <button className="btn-tool" onClick={() => setEditing(true)}><Settings2 size={13} /> Personalizar</button>
              <button className="btn-tool" onClick={handleSync} disabled={syncing}><RefreshCw size={13} className={syncing ? 'spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sincronizar'}</button>
            </>
          )}
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

      {/* Cards */}
      <section className={`dash-section ${editing ? 'is-editing' : ''}`}>
        {editing && (
          <div className="section-editor-bar">
            <span className="section-chip">Cartoes do Geral</span>
            <OverviewMetricPicker label="Metricas dos cartoes" selected={ovConfig.cards} onChange={v => patchOverview({ cards: v })} />
          </div>
        )}
        {renderCards.length === 0 ? (
          <div className="metrics-grid-empty">Nenhum card configurado. Clique em <b>Personalizar</b>.</div>
        ) : (
          <div className="metrics-grid">{renderCards}</div>
        )}
      </section>

      {/* Config Conversoes (so em modo edicao) */}
      {editing && (
        <section className="dash-section is-editing">
          <div className="section-editor-bar">
            <span className="section-chip">Conversoes que somam no Overview</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>marque os eventos que contam pra "conversoes total"</span>
          </div>
          <ConversionActionsPicker
            metaAccountId={accountId}
            gadsCustomerId={gadsCustomerId}
            metaSelected={config.metaConversionActions || []}
            gadsSelected={ovConfig.gadsConversionActionIds || []}
            onMetaChange={v => setConfig(prev => ({ ...prev, metaConversionActions: v }))}
            onGadsChange={v => patchOverview({ gadsConversionActionIds: v })}
          />
        </section>
      )}

      {/* Funil */}
      <section className={`dash-section ${editing ? 'is-editing' : ''}`}>
        {editing && (
          <div className="section-editor-bar">
            <span className="section-chip">Funil do Geral</span>
            <OverviewMetricPicker label="Etapas do funil" selected={ovConfig.funnel} onChange={v => patchOverview({ funnel: v })} />
          </div>
        )}
        <div className="chart-card">
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, letterSpacing: '.02em' }}>Funil de conversao</h3>
          <Funnel steps={funnelSteps} />
        </div>
      </section>
    </div>
  )
}
