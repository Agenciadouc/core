import { useState, useEffect } from 'react'
import { fetchOverview, formatBRL, formatNumber, pctChange, type OverviewData } from '../lib/api'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Line,
} from 'recharts'
import {
  DollarSign, Users, TrendingUp, TrendingDown, Target, Eye, MousePointerClick,
  MessageCircle, ShoppingCart, Globe, Instagram, AlertTriangle, BarChart3,
} from 'lucide-react'

interface Props {
  accountId: string
  accountName: string
  days: number
  since?: string
  until?: string
}

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#130A24', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#9B96B0', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color || '#fff', fontWeight: 600 }}>{p.name}: {p.value}</p>)}
    </div>
  )
}

function Change({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  const ch = pctChange(current, previous)
  if (ch === null) return null
  const pos = invert ? ch <= 0 : ch >= 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: pos ? 'rgba(52,199,89,0.12)' : 'rgba(255,107,107,0.12)', color: pos ? '#34C759' : '#FF6B6B' }}>
      {ch >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {ch > 0 ? '+' : ''}{ch.toFixed(1)}%
    </span>
  )
}

function BigKPI({ label, value, icon, color, current, previous, invert, sub }: {
  label: string; value: string; icon: React.ReactNode; color: string;
  current?: number; previous?: number; invert?: boolean; sub?: string
}) {
  return (
    <div className="metric-card" style={{ minHeight: 110 }}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon" style={{ background: `${color}20`, color }}>{icon}</div>
      </div>
      <div className="metric-value" style={{ fontSize: 26 }}>{value}</div>
      <div className="metric-sub">
        {current !== undefined && previous !== undefined && <Change current={current} previous={previous} invert={invert} />}
        {sub && <span style={{ marginLeft: current !== undefined ? 6 : 0 }}>{sub}</span>}
      </div>
    </div>
  )
}

export default function OverviewView({ accountId, accountName, days, since, until }: Props) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchOverview(accountId, accountName, days, since, until)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [accountId, accountName, days, since, until])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Carregando visao geral...</span></div>
  if (!data) return <div className="empty-state"><div className="icon">📊</div><h3>Sem dados disponiveis</h3></div>

  const t = data.totals
  const s = data.sources
  const hasMeta = !!s.meta
  const hasGads = !!s.gads
  const hasGA4 = !!s.ga4
  const hasIG = !!s.instagram
  const hasKiwify = !!s.kiwify

  // Funnel data
  const totalImpressions = (s.meta?.impressions || 0) + (s.gads?.impressions || 0)
  const totalClicks = (s.meta?.clicks || 0) + (s.gads?.clicks || 0)
  const funnelSteps: { name: string; value: number; color: string }[] = [
    { name: 'Impressoes', value: totalImpressions, color: '#FBBC04' },
    { name: 'Cliques', value: totalClicks, color: '#4285F4' },
  ]
  if (hasGA4) funnelSteps.push({ name: 'Sessoes Site', value: s.ga4!.sessions, color: '#9B59B6' })
  // Bottom of funnel: depends on client type
  const metaLeads = s.meta?.leads || 0
  const metaMsg = s.meta?.messaging || 0
  if (hasKiwify && s.kiwify!.sales > 0) {
    // Client has sales (e.g. Josi) → show only Vendas
    funnelSteps.push({ name: 'Vendas', value: s.kiwify!.sales, color: '#FFB300' })
  } else if (metaLeads > 0 || metaMsg > 0) {
    // Show total leads + conversas combined
    const totalOpp = metaLeads + metaMsg
    const label = metaLeads > 0 && metaMsg > 0 ? 'Leads + Conversas' : metaLeads > 0 ? 'Leads' : 'Conversas'
    funnelSteps.push({ name: label, value: totalOpp, color: '#34A853' })
  }

  // Channel comparison table
  const channels: { name: string; icon: React.ReactNode; color: string; spend: number; leads: number; cpl: number; conversions: number }[] = []
  if (hasMeta) {
    const metaLeads = (s.meta!.leads || 0) + (s.meta!.messaging || 0)
    channels.push({ name: 'Meta Ads', icon: <BarChart3 size={14} />, color: '#1877F2', spend: s.meta!.spend, leads: metaLeads, cpl: metaLeads > 0 ? s.meta!.spend / metaLeads : 0, conversions: s.meta!.purchases || 0 })
  }
  if (hasGads) {
    channels.push({ name: 'Google Ads', icon: <Globe size={14} />, color: '#4285F4', spend: s.gads!.spend, leads: s.gads!.conversions, cpl: s.gads!.conversions > 0 ? s.gads!.spend / s.gads!.conversions : 0, conversions: s.gads!.conversions })
  }

  // Combined daily chart (merge meta daily + ga4 daily by date)
  const dailyMap: Record<string, { date: string; investimento: number; leads: number; sessoes: number }> = {}
  ;(data.metaDaily || []).forEach(d => {
    const date = d.date.slice(5, 10)
    if (!dailyMap[date]) dailyMap[date] = { date, investimento: 0, leads: 0, sessoes: 0 }
    dailyMap[date].investimento += d.spend
    dailyMap[date].leads += d.leads
  })
  ;(s.ga4?.daily || []).forEach(d => {
    const date = d.date.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3')
    if (!dailyMap[date]) dailyMap[date] = { date, investimento: 0, leads: 0, sessoes: 0 }
    dailyMap[date].sessoes += d.sessions
  })
  const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div>
      {/* Alerts */}
      {data.alerts.length > 0 && (
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

      {/* Big KPI Cards */}
      <section className="dash-section">
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {t.spend > 0 && (
            <BigKPI label="Investimento Total" value={formatBRL(t.spend)} icon={<DollarSign size={18} />} color="#EA4335" current={t.spend} previous={t.prevSpend} sub={`Meta${hasGads ? ' + Google' : ''}`} />
          )}
          {hasGA4 && (
            <BigKPI label="Sessoes no Site" value={formatNumber(t.sessions)} icon={<Globe size={18} />} color="#9B59B6" current={t.sessions} previous={t.prevSessions} />
          )}
          {t.metaConversions > 0 && (
            <BigKPI label="Meta Conversoes" value={formatNumber(t.metaConversions)} icon={<Target size={18} />} color="#34A853" current={t.metaConversions} previous={t.prevMetaConversions} sub="Leads + Mensagens" />
          )}
          {t.gadsConversions > 0 && (
            <BigKPI label="Google Conversoes" value={formatNumber(t.gadsConversions)} icon={<BarChart3 size={18} />} color="#4285F4" current={t.gadsConversions} previous={t.prevGadsConversions} sub="Conversoes do site" />
          )}
          {hasKiwify && s.kiwify!.sales > 0 && (
            <BigKPI label="Vendas" value={formatNumber(s.kiwify!.sales)} icon={<ShoppingCart size={18} />} color="#FFB300" current={s.kiwify!.sales} previous={s.kiwify!.prevSales} sub={`Receita: ${formatBRL(s.kiwify!.revenue)}`} />
          )}
          {hasKiwify && s.kiwify!.sales > 0 && t.spend > 0 ? (
            <BigKPI label="Custo por Venda" value={formatBRL(t.spend / s.kiwify!.sales)} icon={<ShoppingCart size={18} />} color="#FFAA83"
              current={t.spend / s.kiwify!.sales} previous={t.prevSpend > 0 && s.kiwify!.prevSales > 0 ? t.prevSpend / s.kiwify!.prevSales : undefined} invert />
          ) : t.cpl > 0 ? (
            <BigKPI label="CPL (Custo/Lead)" value={formatBRL(t.cpl)} icon={<Target size={18} />} color="#FFAA83" current={t.cpl} previous={t.prevCpl} invert />
          ) : null}
          {hasKiwify && t.roas > 0 && (
            <BigKPI label="ROAS" value={`${t.roas.toFixed(2)}x`} icon={<TrendingUp size={18} />} color={t.roas >= 2 ? '#34A853' : t.roas >= 1 ? '#FBBC04' : '#EA4335'} sub={t.roas >= 2 ? 'Saudavel' : t.roas >= 1 ? 'No limite' : 'Negativo'} />
          )}
          {s.crm?.qualSim > 0 && (
            <BigKPI label="Qualificados" value={formatNumber(s.crm.qualSim)} icon={<Target size={18} />} color="#34C759"
              sub={`${s.crm.crmTotal > 0 ? ((s.crm.qualSim / s.crm.crmTotal) * 100).toFixed(0) : 0}% dos leads do CRM`} />
          )}
          {s.crm?.qualNao > 0 && (
            <BigKPI label="Desqualificados" value={formatNumber(s.crm.qualNao)} icon={<TrendingDown size={18} />} color="#FF6B6B"
              sub={`${s.crm.crmTotal > 0 ? ((s.crm.qualNao / s.crm.crmTotal) * 100).toFixed(0) : 0}% sem resposta/retorno`} />
          )}
          {s.crm?.qualMeio > 0 && (
            <BigKPI label="Sem Qualificação" value={formatNumber(s.crm.qualMeio)} icon={<Target size={18} />} color="#9B96B0"
              sub={`${s.crm.crmTotal > 0 ? ((s.crm.qualMeio / s.crm.crmTotal) * 100).toFixed(0) : 0}% pendentes`} />
          )}
          {s.crm?.qualSim > 0 && t.spend > 0 && (
            <BigKPI label="CPL Real (Qualificado)" value={formatBRL(t.spend / s.crm.qualSim)} icon={<DollarSign size={18} />} color="#FFAA83"
              sub="Investimento / leads qualificados" invert />
          )}
        </div>
      </section>

      {/* Funnel + Daily Chart side by side */}
      <section className="dash-section">
        <div className="section-title">Desempenho</div>
        <div className="charts-grid">
          {/* Daily timeline chart */}
          {dailyData.length > 1 && (
            <div className="chart-card">
              <h3>Investimento & Conversoes por Dia</h3>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dailyData}>
                  <defs>
                    <linearGradient id="ovSpendGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EA4335" stopOpacity={0.2} /><stop offset="100%" stopColor="#EA4335" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: '#6E6887', fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fill: '#6E6887', fontSize: 10 }} tickFormatter={(v: number) => `R$${v}`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6E6887', fontSize: 10 }} />
                  <Tooltip content={<Tip />} />
                  <Area yAxisId="left" type="monotone" dataKey="investimento" name="Investimento" stroke="#EA4335" fill="url(#ovSpendGrad2)" strokeWidth={2} />
                  <Bar yAxisId="right" dataKey="leads" name="Leads" fill="#34A853" radius={[3, 3, 0, 0]} barSize={14} opacity={0.8} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Funnel — Same style as Meta Ads tab */}
          {funnelSteps.length >= 3 && (() => {
            const COLORS = ['#FF6B8A', '#FFAA83', '#9B59B6', '#5DADE2', '#34C759', '#FFB300']
            const maxWidth = 100, minWidth = 28
            const widthStep = funnelSteps.length > 1 ? (maxWidth - minWidth) / (funnelSteps.length - 1) : 0
            return (
              <div className="chart-card">
                <h3>Funil de Conversao</h3>
                <div className="funnel-container">
                  {funnelSteps.map((step, i) => {
                    const width = maxWidth - widthStep * i
                    const convRate = i > 0 && funnelSteps[i - 1].value > 0 ? ((step.value / funnelSteps[i - 1].value) * 100).toFixed(1) + '%' : null
                    return (
                      <div key={step.name} className="funnel-tier" style={{ width: `${width}%` }}>
                        <div className="funnel-tier-bar" style={{ background: COLORS[i % COLORS.length] }}>
                          <div className="funnel-tier-label">{step.name}</div>
                          <div className="funnel-tier-value">{formatNumber(step.value)}</div>
                        </div>
                        {convRate && <div className="funnel-tier-rate">{convRate}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </section>

      {/* Channel Comparison */}
      {channels.length > 0 && (
        <section className="dash-section">
          <div className="section-title">Performance por Canal</div>
          <div className="table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th className="right">Investimento</th>
                    <th className="right">Leads/Conv.</th>
                    <th className="right">CPL</th>
                    <th className="right">% do Invest.</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map(ch => (
                    <tr key={ch.name}>
                      <td className="name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: ch.color }}>{ch.icon}</span> {ch.name}
                      </td>
                      <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{formatBRL(ch.spend)}</td>
                      <td className="right" style={{ color: '#34A853' }}>{formatNumber(ch.leads)}</td>
                      <td className="right">{ch.cpl > 0 ? formatBRL(ch.cpl) : '-'}</td>
                      <td className="right">{t.spend > 0 ? ((ch.spend / t.spend) * 100).toFixed(0) + '%' : '-'}</td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', fontWeight: 700 }}>
                    <td className="name">Total</td>
                    <td className="right" style={{ color: '#fff' }}>{formatBRL(t.spend)}</td>
                    <td className="right" style={{ color: '#34A853' }}>{formatNumber(t.leads)}</td>
                    <td className="right">{t.cpl > 0 ? formatBRL(t.cpl) : '-'}</td>
                    <td className="right">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Combined Daily Chart — full width below */}
      {dailyData.length > 2 && hasGA4 && (
        <section className="dash-section">
          <div className="section-title">Sessoes do Site</div>
          <div className="chart-card full-width">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={dailyData}>
                <defs>
                  <linearGradient id="ovSpendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EA4335" stopOpacity={0.2} /><stop offset="100%" stopColor="#EA4335" stopOpacity={0} /></linearGradient>
                  <linearGradient id="ovSessGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9B59B6" stopOpacity={0.2} /><stop offset="100%" stopColor="#9B59B6" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: '#9B96B0', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: '#9B96B0', fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9B96B0', fontSize: 10 }} />
                <Tooltip content={<Tip />} />
                <Area yAxisId="left" type="monotone" dataKey="investimento" name="Investimento" stroke="#EA4335" fill="url(#ovSpendGrad)" strokeWidth={2} />
                {hasGA4 && <Area yAxisId="right" type="monotone" dataKey="sessoes" name="Sessoes" stroke="#9B59B6" fill="url(#ovSessGrad)" strokeWidth={2} />}
                <Bar yAxisId="right" dataKey="leads" name="Leads" fill="#34A853" radius={[3, 3, 0, 0]} barSize={12} opacity={0.8} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 3, background: '#EA4335', display: 'inline-block', borderRadius: 2 }} /> Investimento</span>
              {hasGA4 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 3, background: '#9B59B6', display: 'inline-block', borderRadius: 2 }} /> Sessoes</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: '#34A853', display: 'inline-block', borderRadius: 2 }} /> Leads</span>
            </div>
          </div>
        </section>
      )}

      {/* Meta Ads detail mini */}
      {hasMeta && (
        <section className="dash-section">
          <div className="section-title">Meta Ads — Resumo</div>
          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="metric-card"><div className="metric-label">Investimento</div><div className="metric-value" style={{ fontSize: 18 }}>{formatBRL(s.meta!.spend)}</div></div>
            <div className="metric-card"><div className="metric-label">Alcance</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.meta!.reach)}</div></div>
            <div className="metric-card"><div className="metric-label">Cliques</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.meta!.clicks)}</div></div>
            {s.meta!.messaging > 0 && <div className="metric-card"><div className="metric-label">Conversas</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.meta!.messaging)}</div><div className="metric-sub"><Change current={s.meta!.messaging} previous={s.meta!.prevMessaging} /></div></div>}
            {s.meta!.leads > 0 && <div className="metric-card"><div className="metric-label">Leads Form</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.meta!.leads)}</div><div className="metric-sub"><Change current={s.meta!.leads} previous={s.meta!.prevLeads} /></div></div>}
            {s.meta!.linkClicks > 0 && <div className="metric-card"><div className="metric-label">Link Clicks</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.meta!.linkClicks)}</div></div>}
          </div>
        </section>
      )}

      {/* Google Ads detail mini */}
      {hasGads && (
        <section className="dash-section">
          <div className="section-title">Google Ads — Resumo</div>
          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="metric-card"><div className="metric-label">Investimento</div><div className="metric-value" style={{ fontSize: 18 }}>{formatBRL(s.gads!.spend)}</div></div>
            <div className="metric-card"><div className="metric-label">Cliques</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.gads!.clicks)}</div></div>
            <div className="metric-card"><div className="metric-label">Conversoes</div><div className="metric-value" style={{ fontSize: 18, color: '#34A853' }}>{s.gads!.conversions.toFixed(0)}</div><div className="metric-sub"><Change current={s.gads!.conversions} previous={s.gads!.prevConversions} /></div></div>
            {s.gads!.revenue > 0 && <div className="metric-card"><div className="metric-label">Receita</div><div className="metric-value" style={{ fontSize: 18 }}>{formatBRL(s.gads!.revenue)}</div></div>}
          </div>
        </section>
      )}

      {/* GA4 detail mini */}
      {hasGA4 && (
        <section className="dash-section">
          <div className="section-title">Website — Resumo</div>
          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="metric-card"><div className="metric-label">Sessoes</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.ga4!.sessions)}</div><div className="metric-sub"><Change current={s.ga4!.sessions} previous={s.ga4!.prevSessions} /></div></div>
            <div className="metric-card"><div className="metric-label">Usuarios</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.ga4!.users)}</div><div className="metric-sub"><Change current={s.ga4!.users} previous={s.ga4!.prevUsers} /></div></div>
            <div className="metric-card"><div className="metric-label">Engajamento</div><div className="metric-value" style={{ fontSize: 18 }}>{s.ga4!.engagementRate.toFixed(1)}%</div></div>
            <div className="metric-card"><div className="metric-label">Rejeicao</div><div className="metric-value" style={{ fontSize: 18, color: s.ga4!.bounceRate > 60 ? '#EA4335' : '#34A853' }}>{s.ga4!.bounceRate.toFixed(1)}%</div></div>
          </div>
        </section>
      )}

      {/* Instagram mini */}
      {hasIG && (
        <section className="dash-section">
          <div className="section-title">Instagram — @{s.instagram!.username}</div>
          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="metric-card"><div className="metric-label">Seguidores</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.instagram!.followers)}</div></div>
            <div className="metric-card"><div className="metric-label">Alcance</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.instagram!.reach)}</div></div>
            <div className="metric-card"><div className="metric-label">Interacoes</div><div className="metric-value" style={{ fontSize: 18 }}>{formatNumber(s.instagram!.interactions)}</div></div>
            {s.instagram!.reach > 0 && <div className="metric-card"><div className="metric-label">Taxa Engajamento</div><div className="metric-value" style={{ fontSize: 18 }}>{((s.instagram!.interactions / s.instagram!.reach) * 100).toFixed(2)}%</div></div>}
          </div>
        </section>
      )}
    </div>
  )
}
