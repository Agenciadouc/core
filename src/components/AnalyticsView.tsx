import { useState, useEffect } from 'react'
import {
  fetchGA4Properties, fetchGA4Report, formatNumber, pctChange,
  type GA4Property, type GA4Report,
} from '../lib/api'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  Users, Eye, Clock, TrendingUp, TrendingDown, Globe, Monitor, Smartphone,
  Tablet, FileText, Zap, MousePointerClick, MapPin, Calendar, ArrowRightLeft,
} from 'lucide-react'

interface Props {
  accountName: string
  days: number
  since?: string
  until?: string
}

const SOURCE_COLORS: Record<string, string> = {
  'Organic Search': '#34A853', 'Paid Search': '#4285F4', 'Direct': '#FBBC04',
  'Organic Social': '#E1306C', 'Paid Social': '#1877F2', 'Referral': '#9B59B6',
  'Email': '#EA4335', 'Display': '#FF6B8A', 'Unassigned': '#6B6580', 'Organic Video': '#FF0000',
}
const DEVICE_COLORS = ['#4285F4', '#34A853', '#FBBC04', '#EA4335']
const DEFAULT_COLORS = ['#FFB300', '#34C759', '#5DADE2', '#FF6B8A', '#9B59B6', '#FFAA83', '#2ECC71', '#EA4335']
const DAY_LABELS: Record<string, string> = { Sunday: 'Dom', Monday: 'Seg', Tuesday: 'Ter', Wednesday: 'Qua', Thursday: 'Qui', Friday: 'Sex', Saturday: 'Sab' }
const CHANNEL_LABELS: Record<string, string> = {
  'Direct': 'Direto', 'Organic Search': 'Busca Organica', 'Paid Search': 'Busca Paga',
  'Organic Social': 'Social Organico', 'Paid Social': 'Social Pago', 'Referral': 'Referencia',
  'Email': 'E-mail', 'Display': 'Display', 'Unassigned': 'Nao Atribuido',
  'Organic Video': 'Video Organico', 'Cross-network': 'Cross-network', 'Paid Other': 'Pago Outros',
  'Organic Shopping': 'Shopping Organico', 'Paid Shopping': 'Shopping Pago',
}
const tr = (ch: string) => CHANNEL_LABELS[ch] || ch

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

function KPI({ label, value, icon, color, current, previous, invert, sub }: {
  label: string; value: string; icon: React.ReactNode; color: string;
  current?: number; previous?: number; invert?: boolean; sub?: string
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon" style={{ background: `${color}20`, color }}>{icon}</div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-sub">
        {current !== undefined && previous !== undefined && <Change current={current} previous={previous} invert={invert} />}
        {sub && <span style={{ marginLeft: current !== undefined ? 6 : 0 }}>{sub}</span>}
      </div>
    </div>
  )
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export default function AnalyticsView({ accountName, days, since, until }: Props) {
  const [properties, setProperties] = useState<GA4Property[]>([])
  const [selectedProp, setSelectedProp] = useState<GA4Property | null>(null)
  const [report, setReport] = useState<GA4Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)

  useEffect(() => {
    setLoading(true); setReport(null)
    fetchGA4Properties(accountName)
      .then(data => {
        if (data.available && data.properties.length > 0) {
          setProperties(data.properties); setSelectedProp(data.properties[0])
        } else { setProperties([]); setSelectedProp(null) }
      })
      .catch(() => { setProperties([]); setSelectedProp(null) })
      .finally(() => setLoading(false))
  }, [accountName])

  useEffect(() => {
    if (!selectedProp) return
    setLoadingReport(true)
    fetchGA4Report(selectedProp.id, days, since, until)
      .then(setReport).catch(() => setReport(null))
      .finally(() => setLoadingReport(false))
  }, [selectedProp, days, since, until])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Carregando Analytics...</span></div>
  if (properties.length === 0) return <div className="empty-state"><div className="icon">📈</div><h3>Sem dados Analytics</h3><p>Nenhuma propriedade GA4 vinculada para este cliente.</p></div>

  const c = report?.current, p = report?.previous

  const dailyData = (report?.daily || []).map(d => {
    const fmt = d.date.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3')
    return { day: fmt, Sessoes: d.sessions, Usuarios: d.users, Pageviews: d.pageviews }
  })

  const sourceData = (report?.sources || []).map((s, i) => ({
    name: tr(s.channel), value: s.sessions, fill: SOURCE_COLORS[s.channel] || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }))

  const deviceData = (report?.devices || []).map((d, i) => ({
    name: d.device.charAt(0).toUpperCase() + d.device.slice(1), value: d.sessions, fill: DEVICE_COLORS[i % DEVICE_COLORS.length], ...d,
  }))

  const dowData = (report?.dayOfWeek || []).map(d => ({
    day: DAY_LABELS[d.day] || d.day, Sessoes: d.sessions, Engaj: +d.engagementRate.toFixed(1),
  }))

  return (
    <div>
      {/* Property pills */}
      {properties.length > 1 && (
        <div className="ig-accounts-bar" style={{ marginBottom: 16 }}>
          {properties.map(prop => (
            <button key={prop.id} className={`ig-account-pill ${selectedProp?.id === prop.id ? 'active' : ''}`} onClick={() => setSelectedProp(prop)}>
              <Globe size={12} /><span>{prop.name}</span>
            </button>
          ))}
        </div>
      )}

      {properties.length === 1 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'rgba(251,188,4,0.15)', color: '#FBBC04', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
            Analytics: {selectedProp?.name}
          </span>
          <span style={{ color: '#9B96B0', fontSize: 11 }}>ID: {selectedProp?.id}</span>
        </div>
      )}

      {loadingReport ? (
        <div className="loading-container"><div className="spinner" /><span>Carregando dados...</span></div>
      ) : !report || !c ? (
        <div className="empty-state"><div className="icon">📭</div><h3>Sem dados no periodo</h3></div>
      ) : (
        <>
          {/* KPIs */}
          <section className="dash-section">
            <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <KPI label="Sessoes" value={formatNumber(c.sessions)} icon={<MousePointerClick size={16} />} color="#4285F4" current={c.sessions} previous={p?.sessions} />
              <KPI label="Usuarios" value={formatNumber(c.users)} icon={<Users size={16} />} color="#34A853" current={c.users} previous={p?.users} />
              <KPI label="Novos Usuarios" value={formatNumber(c.newUsers)} icon={<Users size={16} />} color="#FBBC04" current={c.newUsers} previous={p?.newUsers} sub={`${c.users > 0 ? ((c.newUsers / c.users) * 100).toFixed(0) : 0}% novos`} />
              <KPI label="Pageviews" value={formatNumber(c.pageviews)} icon={<Eye size={16} />} color="#9B59B6" current={c.pageviews} previous={p?.pageviews} />
              <KPI label="Pag/Sessao" value={c.pagesPerSession.toFixed(1)} icon={<FileText size={16} />} color="#5DADE2" current={c.pagesPerSession} previous={p?.pagesPerSession} />
              <KPI label="Duracao Media" value={fmtDur(c.avgDuration)} icon={<Clock size={16} />} color="#5DADE2" current={c.avgDuration} previous={p?.avgDuration} />
              <KPI label="Engajamento" value={`${c.engagementRate.toFixed(1)}%`} icon={<Zap size={16} />} color={c.engagementRate >= 60 ? '#34A853' : '#FBBC04'} current={c.engagementRate} previous={p?.engagementRate} />
              <KPI label="Rejeicao" value={`${c.bounceRate.toFixed(1)}%`} icon={<TrendingDown size={16} />} color={c.bounceRate <= 40 ? '#34A853' : c.bounceRate <= 60 ? '#FBBC04' : '#EA4335'} current={c.bounceRate} previous={p?.bounceRate} invert />
              {c.conversions > 0 && <KPI label="Conversoes" value={formatNumber(c.conversions)} icon={<Zap size={16} />} color="#34A853" current={c.conversions} previous={p?.conversions} />}
            </div>
          </section>

          {/* Daily charts */}
          {dailyData.length > 0 && (
            <section className="dash-section">
              <div className="section-title">Trafego Diario</div>
              <div className="charts-grid">
                <div className="chart-card">
                  <h3>Sessoes & Usuarios</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={dailyData}>
                      <defs>
                        <linearGradient id="gaS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4285F4" stopOpacity={0.3} /><stop offset="100%" stopColor="#4285F4" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gaU" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34A853" stopOpacity={0.2} /><stop offset="100%" stopColor="#34A853" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="day" tick={{ fill: '#9B96B0', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#9B96B0', fontSize: 10 }} />
                      <Tooltip content={<Tip />} />
                      <Area type="monotone" dataKey="Sessoes" stroke="#4285F4" fill="url(#gaS)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Usuarios" stroke="#34A853" fill="url(#gaU)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-card">
                  <h3>Pageviews</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={dailyData}>
                      <defs><linearGradient id="gaPv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9B59B6" stopOpacity={0.3} /><stop offset="100%" stopColor="#9B59B6" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="day" tick={{ fill: '#9B96B0', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#9B96B0', fontSize: 10 }} />
                      <Tooltip content={<Tip />} />
                      <Area type="monotone" dataKey="Pageviews" stroke="#9B59B6" fill="url(#gaPv)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

          {/* Sources + Devices + New vs Returning */}
          <section className="dash-section">
            <div className="charts-grid">
              {sourceData.length > 0 && (
                <div className="chart-card">
                  <h3>Fontes de Trafego</h3>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <ResponsiveContainer width="45%" height={200}>
                      <PieChart><Pie data={sourceData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={35} paddingAngle={2}>
                        {sourceData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie><Tooltip content={<Tip />} /></PieChart>
                    </ResponsiveContainer>
                    <div style={{ flex: 1 }}>
                      {report.sources.map((s, i) => {
                        const tot = report.sources.reduce((sum, x) => sum + x.sessions, 0)
                        return (
                          <div key={s.channel} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: sourceData[i]?.fill || '#6B6580', display: 'inline-block' }} />
                              {tr(s.channel)}
                            </span>
                            <span style={{ color: '#9B96B0' }}>{s.sessions} ({tot > 0 ? ((s.sessions / tot) * 100).toFixed(0) : 0}%)</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}



              {deviceData.length > 0 && (
                <div className="chart-card">
                  <h3>Dispositivos</h3>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <ResponsiveContainer width="40%" height={160}>
                      <PieChart><Pie data={deviceData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={30} paddingAngle={3}>
                        {deviceData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie><Tooltip content={<Tip />} /></PieChart>
                    </ResponsiveContainer>
                    <div style={{ flex: 1 }}>
                      {report.devices.map((d, i) => {
                        const Icon = d.device === 'desktop' ? Monitor : d.device === 'mobile' ? Smartphone : Tablet
                        return (
                          <div key={d.device} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={12} style={{ color: DEVICE_COLORS[i] }} />{d.device.charAt(0).toUpperCase() + d.device.slice(1)}</span>
                            <span style={{ color: '#9B96B0', display: 'flex', gap: 10 }}>
                              <span>{d.sessions} sess</span><span>Rej: {d.bounceRate.toFixed(0)}%</span><span>{fmtDur(d.avgDuration)}</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* New vs Returning + Day of Week */}
          <section className="dash-section">
            <div className="charts-grid">
              {report.newVsReturning.length > 0 && (
                <div className="chart-card">
                  <h3><ArrowRightLeft size={14} style={{ marginRight: 6 }} />Novos vs Retornantes</h3>
                  <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                    {report.newVsReturning.map((r, i) => {
                      const isNew = r.type === 'new'
                      const color = isNew ? '#FBBC04' : '#4285F4'
                      return (
                        <div key={r.type} style={{ flex: 1, background: `${color}08`, border: `1px solid ${color}20`, borderRadius: 10, padding: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 10 }}>{isNew ? 'Novos' : 'Retornantes'}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                            <div><div style={{ color: '#9B96B0' }}>Sessoes</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{formatNumber(r.sessions)}</div></div>
                            <div><div style={{ color: '#9B96B0' }}>Usuarios</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{formatNumber(r.users)}</div></div>
                            <div><div style={{ color: '#9B96B0' }}>Engajamento</div><div style={{ fontWeight: 600 }}>{r.engagementRate.toFixed(1)}%</div></div>
                            <div><div style={{ color: '#9B96B0' }}>Rejeicao</div><div style={{ fontWeight: 600, color: r.bounceRate > 60 ? '#EA4335' : undefined }}>{r.bounceRate.toFixed(1)}%</div></div>
                            <div><div style={{ color: '#9B96B0' }}>Duracao</div><div style={{ fontWeight: 600 }}>{fmtDur(r.avgDuration)}</div></div>
                            <div><div style={{ color: '#9B96B0' }}>Pag/Sess</div><div style={{ fontWeight: 600 }}>{r.sessions > 0 ? (r.pageviews / r.sessions).toFixed(1) : '0'}</div></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {dowData.length > 0 && (
                <div className="chart-card">
                  <h3><Calendar size={14} style={{ marginRight: 6 }} />Performance por Dia da Semana</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dowData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="day" tick={{ fill: '#9B96B0', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#9B96B0', fontSize: 10 }} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="Sessoes" fill="#4285F4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>

          {/* Source/Medium Table */}
          {report.sourceMedium.length > 0 && (
            <section className="dash-section">
              <div className="section-title">Fonte / Midia (Detalhado)</div>
              <div className="table-card">
                <div style={{ overflowX: 'auto' }}>
                  <table className="campaign-table">
                    <thead><tr>
                      <th>Fonte / Midia</th><th className="right">Sessoes</th><th className="right">Usuarios</th>
                      <th className="right">Novos</th><th className="right">Engajamento</th><th className="right">Rejeicao</th>
                      <th className="right">Conv.</th>
                    </tr></thead>
                    <tbody>
                      {report.sourceMedium.map((s, i) => (
                        <tr key={i}>
                          <td className="name">{s.sourceMedium}</td>
                          <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{formatNumber(s.sessions)}</td>
                          <td className="right">{formatNumber(s.users)}</td>
                          <td className="right">{formatNumber(s.newUsers)}</td>
                          <td className="right"><span style={{ color: s.engagementRate >= 60 ? '#34A853' : s.engagementRate >= 40 ? '#FBBC04' : '#EA4335' }}>{s.engagementRate.toFixed(1)}%</span></td>
                          <td className="right"><span style={{ color: s.bounceRate <= 40 ? '#34A853' : s.bounceRate <= 60 ? '#FBBC04' : '#EA4335' }}>{s.bounceRate.toFixed(1)}%</span></td>
                          <td className="right" style={{ color: s.conversions > 0 ? '#34A853' : undefined }}>{s.conversions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Landing Pages Table */}
          {report.landingPages.length > 0 && (
            <section className="dash-section">
              <div className="section-title">Landing Pages (Paginas de Entrada)</div>
              <div className="table-card">
                <div style={{ overflowX: 'auto' }}>
                  <table className="campaign-table">
                    <thead><tr>
                      <th>Pagina</th><th className="right">Sessoes</th><th className="right">Usuarios</th>
                      <th className="right">Engajamento</th><th className="right">Rejeicao</th>
                      <th className="right">Duracao</th><th className="right">Conv.</th>
                    </tr></thead>
                    <tbody>
                      {report.landingPages.map((lp, i) => (
                        <tr key={i}>
                          <td className="name" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <FileText size={10} style={{ marginRight: 6, opacity: 0.5 }} />{lp.page}
                          </td>
                          <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{formatNumber(lp.sessions)}</td>
                          <td className="right">{formatNumber(lp.users)}</td>
                          <td className="right"><span style={{ color: lp.engagementRate >= 60 ? '#34A853' : lp.engagementRate >= 40 ? '#FBBC04' : '#EA4335' }}>{lp.engagementRate.toFixed(1)}%</span></td>
                          <td className="right"><span style={{ color: lp.bounceRate <= 40 ? '#34A853' : lp.bounceRate <= 60 ? '#FBBC04' : '#EA4335' }}>{lp.bounceRate.toFixed(1)}%</span></td>
                          <td className="right">{fmtDur(lp.avgDuration)}</td>
                          <td className="right" style={{ color: lp.conversions > 0 ? '#34A853' : undefined }}>{lp.conversions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Events Table */}
          {report.events.length > 0 && (
            <section className="dash-section">
              <div className="section-title">Eventos / Micro-conversoes</div>
              <div className="table-card">
                <div style={{ overflowX: 'auto' }}>
                  <table className="campaign-table">
                    <thead><tr><th>Evento</th><th className="right">Contagem</th><th className="right">Usuarios</th><th className="right">Eventos/Usuario</th></tr></thead>
                    <tbody>
                      {report.events.slice(0, 15).map((ev, i) => {
                        const isKey = ['generate_lead', 'form_submit', 'purchase', 'phone_click', 'click', 'scroll', 'file_download', 'add_to_cart'].some(k => ev.name.includes(k))
                        return (
                          <tr key={i}>
                            <td className="name">
                              <Zap size={10} style={{ marginRight: 6, color: isKey ? '#34A853' : '#9B96B0' }} />
                              {ev.name}
                              {isKey && <span style={{ marginLeft: 6, fontSize: 9, color: '#34A853', fontWeight: 600 }}>KEY</span>}
                            </td>
                            <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{formatNumber(ev.count)}</td>
                            <td className="right">{formatNumber(ev.users)}</td>
                            <td className="right">{ev.users > 0 ? (ev.count / ev.users).toFixed(1) : '0'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Cities + Top Pages side by side */}
          <section className="dash-section">
            <div className="charts-grid">
              {/* Cities */}
              {report.cities.length > 0 && (
                <div className="chart-card">
                  <h3><MapPin size={14} style={{ marginRight: 6 }} />Cidades</h3>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {report.cities.slice(0, 12).map((city, i) => {
                      const maxSess = report.cities[0]?.sessions || 1
                      const pct = (city.sessions / maxSess) * 100
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                          <span style={{ width: 120, color: '#fff', fontWeight: i === 0 ? 600 : 400 }}>{city.city}</span>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #4285F4, #5DADE2)', borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                              <span style={{ fontSize: 9, color: '#fff', fontWeight: 600 }}>{city.sessions}</span>
                            </div>
                          </div>
                          <span style={{ color: '#9B96B0', fontSize: 11, width: 50, textAlign: 'right' }}>{city.users} usr</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Top Pages */}
              {report.pages.length > 0 && (
                <div className="chart-card">
                  <h3><FileText size={14} style={{ marginRight: 6 }} />Paginas Mais Visitadas</h3>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {report.pages.slice(0, 10).map((pg, i) => {
                      const maxPv = report.pages[0]?.pageviews || 1
                      const pct = (pg.pageviews / maxPv) * 100
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                          <span style={{ width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }} title={pg.path}>{pg.path}</span>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #9B59B6, #FF6B8A)', borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                              <span style={{ fontSize: 9, color: '#fff', fontWeight: 600 }}>{pg.pageviews}</span>
                            </div>
                          </div>
                          <span style={{ color: pg.bounceRate <= 40 ? '#34A853' : pg.bounceRate <= 60 ? '#FBBC04' : '#EA4335', fontSize: 10, width: 40, textAlign: 'right' }}>{pg.bounceRate.toFixed(0)}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
