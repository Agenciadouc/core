import { useState, useEffect } from 'react'
import {
  fetchGAdsAccounts, fetchGAdsCampaigns, fetchGAdsDaily, fetchGAdsKeywords,
  fetchGAdsSearchTerms, fetchGAdsDevices, fetchGAdsHourly, fetchGAdsConversions,
  formatBRL, formatNumber, pctChange,
  type GAdsAccount, type GAdsCampaignsResponse, type GAdsDaily,
  type GAdsKeyword, type GAdsSearchTerm, type GAdsDevice, type GAdsHourly, type GAdsConversionAction,
} from '../lib/api'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  DollarSign, MousePointerClick, Eye, Target, TrendingUp, TrendingDown,
  Search as SearchIcon, Monitor, Smartphone, Tablet, Award, Clock,
} from 'lucide-react'

interface Props {
  accountName: string
  days: number
  since?: string
  until?: string
}

const DEVICE_LABELS: Record<string, string> = { DESKTOP: 'Desktop', MOBILE: 'Mobile', TABLET: 'Tablet', CONNECTED_TV: 'TV', OTHER: 'Outro' }
const DEVICE_ICONS: Record<string, any> = { DESKTOP: Monitor, MOBILE: Smartphone, TABLET: Tablet }
const DEVICE_COLORS = ['#4285F4', '#34A853', '#FBBC04', '#EA4335', '#9B59B6']

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

export default function GoogleAdsView({ accountName, days, since, until }: Props) {
  const [gadsAccount, setGadsAccount] = useState<GAdsAccount | null>(null)
  const [campaigns, setCampaigns] = useState<GAdsCampaignsResponse | null>(null)
  const [daily, setDaily] = useState<GAdsDaily[]>([])
  const [keywords, setKeywords] = useState<GAdsKeyword[]>([])
  const [searchTerms, setSearchTerms] = useState<GAdsSearchTerm[]>([])
  const [devices, setDevices] = useState<GAdsDevice[]>([])
  const [hourly, setHourly] = useState<GAdsHourly[]>([])
  const [convActions, setConvActions] = useState<GAdsConversionAction[]>([])
  const [loading, setLoading] = useState(true)
  const [noAccount, setNoAccount] = useState(false)

  useEffect(() => {
    setLoading(true)
    setNoAccount(false)
    setCampaigns(null)

    fetchGAdsAccounts()
      .then(accounts => {
        const lower = accountName.toLowerCase()
        const cleaned = lower.replace(/^(ca\s*-?\s*|[\d]+\s*-\s*)/i, '').trim()
        // Filter out generic words that match multiple accounts
        const GENERIC = ['imobiliária', 'imobiliaria', 'imoveis', 'imóveis', 'construtora', 'conta', 'nova', 'venda', 'vendas', 'teste', 'mkt', 'marketing']
        const words = cleaned.split(/[\s\-]+/).filter(w => w.length >= 3 && !GENERIC.includes(w))

        const match = accounts.find(a => {
          const aLower = a.name.toLowerCase()
          return words.some(w => aLower.includes(w))
        })

        if (!match) { setNoAccount(true); setLoading(false); return }
        setGadsAccount(match)

        return Promise.all([
          fetchGAdsCampaigns(match.id, days, since, until).catch(() => null),
          fetchGAdsDaily(match.id, days, since, until).catch(() => []),
          fetchGAdsKeywords(match.id, days, since, until).catch(() => []),
          fetchGAdsSearchTerms(match.id, days, since, until).catch(() => []),
          fetchGAdsDevices(match.id, days, since, until).catch(() => []),
          fetchGAdsHourly(match.id, days, since, until).catch(() => []),
          fetchGAdsConversions(match.id, days, since, until).catch(() => []),
        ]).then(([camp, d, kw, st, dev, hr, conv]) => {
          setCampaigns(camp)
          setDaily(d as GAdsDaily[])
          setKeywords(kw as GAdsKeyword[])
          setSearchTerms(st as GAdsSearchTerm[])
          setDevices(dev as GAdsDevice[])
          setHourly(hr as GAdsHourly[])
          setConvActions(conv as GAdsConversionAction[])
        })
      })
      .catch(() => setNoAccount(true))
      .finally(() => setLoading(false))
  }, [accountName, days, since, until])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Carregando Google Ads...</span></div>
  if (noAccount) return <div className="empty-state"><div className="icon">📊</div><h3>Sem dados Google Ads</h3><p>Nenhuma conta Google Ads vinculada para este cliente.</p></div>

  const t = campaigns?.totals
  const pt = campaigns?.prevTotals
  const dailyData = daily.map(d => ({ day: d.date.slice(5), Gasto: +d.spend.toFixed(2), Clicks: d.clicks, Conv: d.conversions }))

  // Device pie data
  const devicePieData = devices.map((d, i) => ({
    name: DEVICE_LABELS[d.device] || d.device, value: +d.spend.toFixed(2), fill: DEVICE_COLORS[i % DEVICE_COLORS.length],
  }))

  // Hourly chart - find peak and dead hours
  const maxHourSpend = Math.max(...hourly.map(h => h.spend), 1)
  const deadHours = hourly.filter(h => h.spend > 0 && h.conversions === 0).length
  const peakHour = hourly.reduce((best, h) => h.conversions > (best?.conversions || 0) ? h : best, hourly[0])

  return (
    <div>
      {/* Account badge */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ background: 'rgba(66,133,244,0.15)', color: '#4285F4', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
          Google Ads: {gadsAccount?.name}
        </span>
        <span style={{ color: '#9B96B0', fontSize: 11 }}>ID: {gadsAccount?.id}</span>
      </div>

      {/* KPI Cards with comparison */}
      {t && (
        <section className="dash-section">
          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))' }}>
            <KPI label="Investimento" value={formatBRL(t.spend)} icon={<DollarSign size={16} />} color="#4285F4"
              current={t.spend} previous={pt?.spend} />
            <KPI label="Impressoes" value={formatNumber(t.impressions)} icon={<Eye size={16} />} color="#FBBC04"
              current={t.impressions} previous={pt?.impressions} />
            <KPI label="Cliques" value={formatNumber(t.clicks)} icon={<MousePointerClick size={16} />} color="#34A853"
              current={t.clicks} previous={pt?.clicks} sub={`CTR: ${t.ctr.toFixed(2)}%`} />
            <KPI label="CPC" value={formatBRL(t.cpc)} icon={<DollarSign size={16} />} color="#EA4335"
              current={t.cpc} previous={pt?.cpc} invert />
            <KPI label="Conversoes" value={t.conversions.toFixed(0)} icon={<Target size={16} />} color="#34A853"
              current={t.conversions} previous={pt?.conversions} sub={`Taxa: ${t.convRate.toFixed(2)}%`} />
            <KPI label="CPA" value={formatBRL(t.cpa)} icon={<DollarSign size={16} />} color="#EA4335"
              current={t.cpa} previous={pt?.cpa} invert />
            {t.roas > 0 && (
              <KPI label="ROAS" value={`${t.roas.toFixed(2)}x`} icon={<TrendingUp size={16} />}
                color={t.roas >= 2 ? '#34A853' : t.roas >= 1 ? '#FBBC04' : '#EA4335'}
                current={t.roas} previous={pt?.roas} sub={`Receita: ${formatBRL(t.revenue)}`} />
            )}
            {t.avgQualityScore !== null && (
              <KPI label="Quality Score" value={t.avgQualityScore.toFixed(1)} icon={<Award size={16} />}
                color={t.avgQualityScore >= 7 ? '#34A853' : t.avgQualityScore >= 5 ? '#FBBC04' : '#EA4335'}
                sub={t.avgQualityScore >= 7 ? 'Bom' : t.avgQualityScore >= 5 ? 'Medio' : 'Baixo'} />
            )}
          </div>
        </section>
      )}

      {/* Charts: Daily spend + clicks + conversions */}
      {dailyData.length > 0 && (
        <section className="dash-section">
          <div className="section-title">Desempenho Diario</div>
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Investimento Diario</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData}>
                  <defs><linearGradient id="gadsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4285F4" stopOpacity={0.3} /><stop offset="100%" stopColor="#4285F4" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="day" tick={{ fill: '#9B96B0', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9B96B0', fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="Gasto" stroke="#4285F4" fill="url(#gadsGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h3>Conversoes Diarias</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData}>
                  <defs><linearGradient id="gadsConvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34A853" stopOpacity={0.3} /><stop offset="100%" stopColor="#34A853" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="day" tick={{ fill: '#9B96B0', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9B96B0', fontSize: 10 }} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="Conv" stroke="#34A853" fill="url(#gadsConvGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Device + Hourly row */}
      <section className="dash-section">
        <div className="charts-grid">
          {/* Device breakdown */}
          {devices.length > 0 && (
            <div className="chart-card">
              <h3>Performance por Dispositivo</h3>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <ResponsiveContainer width="40%" height={180}>
                  <PieChart>
                    <Pie data={devicePieData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={3}>
                      {devicePieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1 }}>
                  {devices.map((d, i) => {
                    const Icon = DEVICE_ICONS[d.device] || Monitor
                    return (
                      <div key={d.device} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon size={12} style={{ color: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
                          {DEVICE_LABELS[d.device] || d.device}
                        </span>
                        <span style={{ color: '#9B96B0', display: 'flex', gap: 12 }}>
                          <span>{formatBRL(d.spend)}</span>
                          <span>{d.clicks} clk</span>
                          <span style={{ color: d.convRate > 0 ? '#34A853' : undefined }}>{d.convRate.toFixed(1)}%</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Hourly performance */}
          {hourly.length > 0 && (
            <div className="chart-card">
              <h3>Performance por Hora</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="hour" tick={{ fill: '#9B96B0', fontSize: 9 }} tickFormatter={h => `${h}h`} />
                  <YAxis tick={{ fill: '#9B96B0', fontSize: 9 }} tickFormatter={v => `R$${v}`} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="spend" name="Gasto" fill="#4285F4" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
                {peakHour && <span style={{ color: '#34A853' }}><Clock size={10} /> Melhor hora: {peakHour.hour}h ({peakHour.conversions.toFixed(0)} conv)</span>}
                {deadHours > 0 && <span style={{ color: '#FF6B6B' }}>Horas sem conversao: {deadHours}</span>}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Campaigns Table (enhanced) */}
      {campaigns && campaigns.campaigns.length > 0 && (
        <section className="dash-section">
          <div className="section-title">Campanhas</div>
          <div className="table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th className="right">Invest.</th>
                    <th className="right">Impress.</th>
                    <th className="right">Cliques</th>
                    <th className="right">CTR</th>
                    <th className="right">CPC</th>
                    <th className="right">Conv.</th>
                    <th className="right">Taxa Conv.</th>
                    <th className="right">CPA</th>
                    <th className="right">Impr. Share</th>
                    <th className="right">Top Impr.</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.campaigns.map(c => (
                    <tr key={c.id}>
                      <td className="name" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginRight: 6, background: c.status === 'ENABLED' ? '#34A853' : '#9B96B0' }} />
                        {c.name}
                      </td>
                      <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{formatBRL(c.spend)}</td>
                      <td className="right">{formatNumber(c.impressions)}</td>
                      <td className="right">{formatNumber(c.clicks)}</td>
                      <td className="right">{c.ctr.toFixed(2)}%</td>
                      <td className="right">{formatBRL(c.cpc)}</td>
                      <td className="right" style={{ color: c.conversions > 0 ? '#34A853' : undefined }}>{c.conversions.toFixed(0)}</td>
                      <td className="right">{c.convRate.toFixed(2)}%</td>
                      <td className="right">{c.cpa > 0 ? formatBRL(c.cpa) : '-'}</td>
                      <td className="right">
                        {c.impressionShare > 0 ? (
                          <span style={{ color: c.impressionShare >= 70 ? '#34A853' : c.impressionShare >= 40 ? '#FBBC04' : '#EA4335' }}>
                            {c.impressionShare.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="right">
                        {c.topImprShare > 0 ? `${c.topImprShare.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Conversion Actions Breakdown */}
      {convActions.length > 0 && (
        <section className="dash-section">
          <div className="section-title">Detalhamento de Conversoes</div>
          <div className="table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Acao de Conversao</th>
                    <th className="right">Conversoes</th>
                    <th className="right">% do Total</th>
                  </tr>
                </thead>
                <tbody>
                  {convActions.map((a, i) => {
                    const totalConv = convActions.reduce((s, x) => s + x.conversions, 0)
                    const pct = totalConv > 0 ? (a.conversions / totalConv) * 100 : 0
                    return (
                      <tr key={i}>
                        <td className="name">{a.name}</td>
                        <td className="right" style={{ fontWeight: 600, color: '#34A853' }}>{formatNumber(a.conversions)}</td>
                        <td className="right">{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }}>
                    <td>Total</td>
                    <td className="right" style={{ color: '#34A853' }}>{formatNumber(convActions.reduce((s, x) => s + x.conversions, 0))}</td>
                    <td className="right">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Search Terms Table */}
      {searchTerms.length > 0 && (
        <section className="dash-section">
          <div className="section-title">Termos de Busca (Top 30 por Gasto)</div>
          <div className="table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Termo de Busca</th>
                    <th>Campanha</th>
                    <th className="right">Impress.</th>
                    <th className="right">Cliques</th>
                    <th className="right">CTR</th>
                    <th className="right">CPC</th>
                    <th className="right">Invest.</th>
                    <th className="right">Conv.</th>
                    <th className="right">CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {searchTerms.map((st, i) => {
                    const cpa = st.conversions > 0 ? st.spend / st.conversions : 0
                    const isWaste = st.spend > 5 && st.conversions === 0
                    return (
                      <tr key={i} style={{ background: isWaste ? 'rgba(234,67,53,0.06)' : undefined }}>
                        <td className="name" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <SearchIcon size={10} style={{ marginRight: 6, opacity: 0.5 }} />
                          {st.term}
                          {isWaste && <span style={{ marginLeft: 6, fontSize: 9, color: '#EA4335', fontWeight: 600 }}>DESPERDICIO</span>}
                        </td>
                        <td style={{ fontSize: 10, color: '#9B96B0', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.campaign}</td>
                        <td className="right">{formatNumber(st.impressions)}</td>
                        <td className="right">{formatNumber(st.clicks)}</td>
                        <td className="right">{st.ctr.toFixed(2)}%</td>
                        <td className="right">{formatBRL(st.cpc)}</td>
                        <td className="right" style={{ fontWeight: 600 }}>{formatBRL(st.spend)}</td>
                        <td className="right" style={{ color: st.conversions > 0 ? '#34A853' : undefined }}>{st.conversions.toFixed(0)}</td>
                        <td className="right">{cpa > 0 ? formatBRL(cpa) : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Keywords Table */}
      {keywords.length > 0 && (
        <section className="dash-section">
          <div className="section-title">Top Keywords</div>
          <div className="table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th className="right">Tipo</th>
                    <th className="right">QS</th>
                    <th className="right">Impress.</th>
                    <th className="right">Cliques</th>
                    <th className="right">CTR</th>
                    <th className="right">CPC</th>
                    <th className="right">Invest.</th>
                    <th className="right">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.slice(0, 25).map((kw, i) => (
                    <tr key={i}>
                      <td className="name"><SearchIcon size={10} style={{ marginRight: 6, opacity: 0.5 }} />{kw.keyword}</td>
                      <td className="right" style={{ fontSize: 10, color: '#9B96B0' }}>{kw.matchType}</td>
                      <td className="right">
                        {kw.qualityScore ? (
                          <span style={{ display: 'inline-block', width: 22, height: 22, lineHeight: '22px', textAlign: 'center', borderRadius: '50%', fontSize: 10, fontWeight: 700,
                            background: kw.qualityScore >= 7 ? 'rgba(52,168,83,0.15)' : kw.qualityScore >= 5 ? 'rgba(251,188,4,0.15)' : 'rgba(234,67,53,0.15)',
                            color: kw.qualityScore >= 7 ? '#34A853' : kw.qualityScore >= 5 ? '#FBBC04' : '#EA4335' }}>
                            {kw.qualityScore}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="right">{formatNumber(kw.impressions)}</td>
                      <td className="right">{formatNumber(kw.clicks)}</td>
                      <td className="right">{kw.ctr.toFixed(2)}%</td>
                      <td className="right">{formatBRL(kw.cpc)}</td>
                      <td className="right" style={{ fontWeight: 600 }}>{formatBRL(kw.spend)}</td>
                      <td className="right" style={{ color: kw.conversions > 0 ? '#34A853' : undefined }}>{kw.conversions.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
