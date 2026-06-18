import { useState, useEffect } from 'react'
import { fetchCRM, formatNumber, formatBRL, pctChange, type CRMData } from '../lib/api'
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area,
} from 'recharts'
import { Users, UserCheck, Phone, Eye, Home, Key, AlertTriangle, TrendingUp, TrendingDown, UserX, ArrowRight, MapPin, ShoppingCart } from 'lucide-react'

interface Props {
  accountId: string
  accountName: string
  days: number
  adSpend?: number
}

const FUNNEL_COLORS = ['#FFB300', '#FFAA83', '#34C759', '#5DADE2', '#FF6B8A', '#FF6B6B', '#9B59B6']
const SOURCE_COLORS = ['#FFB300', '#FFAA83', '#34C759', '#5DADE2', '#9B59B6', '#FF6B8A', '#2ECC71', '#E74C3C', '#3498DB']

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#130A24', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#9B96B0', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color || '#fff', fontWeight: 600 }}>{p.name}: {p.value}</p>)}
    </div>
  )
}

function Change({ current, previous }: { current: number; previous: number }) {
  const ch = pctChange(current, previous)
  if (ch === null) return null
  const pos = ch >= 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: pos ? 'rgba(52,199,89,0.12)' : 'rgba(255,107,107,0.12)', color: pos ? '#34C759' : '#FF6B6B' }}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? '+' : ''}{ch.toFixed(1)}%
    </span>
  )
}

function Stat({ label, value, sub, icon, color, alert, current, previous }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string; alert?: string; current?: number; previous?: number }) {
  return (
    <div className={`metric-card ${alert ? 'metric-alert' : ''}`}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon" style={{ background: `${color}20`, color }}>{icon}</div>
      </div>
      <div className="metric-value">{typeof value === 'number' ? formatNumber(value) : value}</div>
      <div className="metric-sub">
        {current !== undefined && previous !== undefined && <Change current={current} previous={previous} />}
        {sub && <span style={{ marginLeft: current !== undefined ? 6 : 0 }}>{sub}</span>}
      </div>
      {alert && <div className="metric-alert-text"><AlertTriangle size={10} /> {alert}</div>}
    </div>
  )
}

// ========== KELLERMANN CRM ==========
function KellermannCRM({ data, days, adSpend }: { data: CRMData; days: number; adSpend?: number }) {
  const qualSim = data.qualSim || 0
  const qualNao = data.qualNao || 0
  const qualMeio = data.qualMeio || 0
  const semRetorno = data.semRetorno || 0
  const qualRate = data.generalQualRate || '0'
  const agentQual = data.agentQual || {}
  const sourceQual = data.sourceQual || {}

  const agentRows = Object.entries(agentQual)
    .filter(([k]) => k && k.trim() !== '' && k !== 'Sem corretor')
    .sort((a, b) => b[1].total - a[1].total)

  const sourceRows = Object.entries(sourceQual)
    .filter(([k]) => k && k !== 'Sem origem' && k.trim() !== '')
    .sort((a, b) => b[1].total - a[1].total)

  return (
    <div className="crm-section">
      <section className="dash-section">
        <div className="section-title">CRM — Leads ({days} dias)</div>
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Stat label="Total de Leads" value={data.total} sub={`Ultimos ${days} dias`} icon={<Users size={16} />} color="#FFB300" current={data.total} previous={data.previous.total} />
          <Stat label="Qualificados (SIM)" value={qualSim} sub={`${qualRate}% do total`} icon={<UserCheck size={16} />} color="#34C759" />
          <Stat label="Meio Termo" value={qualMeio} sub={`${data.total > 0 ? ((qualMeio / data.total) * 100).toFixed(0) : 0}%`} icon={<Users size={16} />} color="#FFB300" />
          <Stat label="Nao Qualificados" value={qualNao} sub={`${data.total > 0 ? ((qualNao / data.total) * 100).toFixed(0) : 0}%`} icon={<UserX size={16} />} color="#FFAA83" />
          <Stat label="Sem Retorno" value={semRetorno} sub={`${data.total > 0 ? ((semRetorno / data.total) * 100).toFixed(0) : 0}%`} icon={<Phone size={16} />} color="#FF6B6B" />
          {adSpend && data.total > 0 && (
            <Stat label="Custo por Lead" value={formatBRL(adSpend / data.total)} sub={`R$ ${adSpend.toFixed(0)} / ${data.total} leads`} icon={<TrendingDown size={16} />} color="#FFAA83" />
          )}
          {adSpend && qualSim > 0 && (
            <Stat label="Custo por Lead Qualif." value={formatBRL(adSpend / qualSim)} sub={`R$ ${adSpend.toFixed(0)} / ${qualSim} qualificados`} icon={<UserCheck size={16} />} color="#34C759" />
          )}
        </div>
      </section>

      {agentRows.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Leads por Corretor</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Corretor</th>
                    <th className="right">Leads</th>
                    <th className="right">SIM</th>
                    <th className="right">Meio Termo</th>
                    <th className="right">NAO</th>
                    <th className="right">Sem Retorno</th>
                    <th className="right">% Qualif.</th>
                  </tr>
                </thead>
                <tbody>
                  {agentRows.map(([name, q]) => (
                    <tr key={name}>
                      <td className="name">{name}</td>
                      <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{q.total}</td>
                      <td className="right" style={{ color: '#34C759' }}>{q.sim}</td>
                      <td className="right" style={{ color: '#FFB300' }}>{q.meio}</td>
                      <td className="right" style={{ color: '#FFAA83' }}>{q.nao}</td>
                      <td className="right" style={{ color: q.semRetorno > 0 ? '#FF6B6B' : undefined }}>{q.semRetorno}</td>
                      <td className="right"><span className="change-badge positive">{q.total > 0 ? ((q.sim / q.total) * 100).toFixed(0) : 0}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {sourceRows.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Leads por Canal</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th className="right">Leads</th>
                    <th className="right">SIM</th>
                    <th className="right">Meio Termo</th>
                    <th className="right">NAO</th>
                    <th className="right">Sem Retorno</th>
                    <th className="right">% Qualif.</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map(([source, q]) => (
                    <tr key={source}>
                      <td className="name">{source}</td>
                      <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{q.total}</td>
                      <td className="right" style={{ color: '#34C759' }}>{q.sim}</td>
                      <td className="right" style={{ color: '#FFB300' }}>{q.meio}</td>
                      <td className="right" style={{ color: '#FFAA83' }}>{q.nao}</td>
                      <td className="right" style={{ color: q.semRetorno > 0 ? '#FF6B6B' : undefined }}>{q.semRetorno}</td>
                      <td className="right"><span className="change-badge positive">{q.total > 0 ? ((q.sim / q.total) * 100).toFixed(0) : 0}%</span></td>
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

// ========== SAMECO CRM ==========
function SamecoCRM({ data, days, adSpend }: { data: CRMData; days: number; adSpend?: number }) {
  const tipoCounts = data.tipoCounts || {}
  const faixaCounts = data.faixaCounts || {}
  const residencia = tipoCounts['Residência'] || 0
  const empresa = tipoCounts['Empresa'] || 0
  const qualSim = data.qualSim || 0
  const qualNao = data.qualNao || 0
  const qualEmAtendimento = data.qualEmAtendimento || 0
  const qualVendido = data.qualVendido || 0
  const qualRate = data.generalQualRate || '0'
  const sourceQual = data.sourceQual || {}

  const sourceData = Object.entries(data.sourceCounts)
    .filter(([k]) => k && k !== 'Sem origem')
    .sort((a, b) => b[1] - a[1])

  const sourceQualRows = Object.entries(sourceQual)
    .filter(([k]) => k && k !== 'Sem origem' && k.trim() !== '')
    .sort((a, b) => b[1].total - a[1].total)

  // Faixa energia ordered
  const faixaOrder = ['Até R$ 200', 'R$ 201 a R$ 400', 'R$ 401 a R$ 700', 'Acima de R$ 700', 'Não informado']
  const faixaData = faixaOrder
    .filter(f => faixaCounts[f])
    .map(f => ({ name: f, value: faixaCounts[f] || 0 }))

  const faixaColors: Record<string, string> = {
    'Até R$ 200': '#FF6B6B',
    'R$ 201 a R$ 400': '#FFAA83',
    'R$ 401 a R$ 700': '#FFB300',
    'Acima de R$ 700': '#34C759',
    'Não informado': '#6B6580',
  }

  const dailyData = data.dailyLeads.map(d => ({ day: d.date.slice(0, 5), Leads: d.count }))

  return (
    <div className="crm-section">
      <section className="dash-section">
        <div className="section-title">CRM — Leads Energia Solar ({days} dias)</div>
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Stat label="Total de Leads" value={data.total} sub={`Ultimos ${days} dias`} icon={<Users size={16} />} color="#FFB300" current={data.total} previous={data.previous.total} />
          <Stat label="Qualificados" value={qualSim} sub={`${qualRate}% do total`} icon={<UserCheck size={16} />} color="#5DADE2" />
          <Stat label="Em Atendimento" value={qualEmAtendimento} sub={`${data.total > 0 ? ((qualEmAtendimento / data.total) * 100).toFixed(0) : 0}%`} icon={<Users size={16} />} color="#FFB300" />
          <Stat label="Desqualificados" value={qualNao} sub={`${data.total > 0 ? ((qualNao / data.total) * 100).toFixed(0) : 0}%`} icon={<UserX size={16} />} color="#FF6B6B" />
          <Stat label="Vendidos" value={qualVendido} sub={`${data.total > 0 ? ((qualVendido / data.total) * 100).toFixed(0) : 0}%`} icon={<TrendingUp size={16} />} color="#34C759" />
          {adSpend && data.total > 0 && (
            <Stat label="Custo por Lead" value={formatBRL(adSpend / data.total)} sub={`${formatBRL(adSpend)} investido`} icon={<TrendingDown size={16} />} color="#FFAA83" />
          )}
          {adSpend && qualSim > 0 && (
            <Stat label="Custo por Lead Qualif." value={formatBRL(adSpend / qualSim)} sub={`${formatBRL(adSpend)} / ${qualSim} qualificados`} icon={<UserCheck size={16} />} color="#34C759" />
          )}
        </div>
      </section>

      {/* Faixa de energia */}
      {faixaData.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Faixa de Conta de Energia</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Faixa</th>
                    <th className="right">Leads</th>
                    <th className="right">%</th>
                    <th style={{ width: '40%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {faixaData.map(f => (
                    <tr key={f.name}>
                      <td className="name" style={{ color: faixaColors[f.name] || '#fff' }}>{f.name}</td>
                      <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{f.value}</td>
                      <td className="right">{data.total > 0 ? ((f.value / data.total) * 100).toFixed(0) : 0}%</td>
                      <td>
                        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${data.total > 0 ? (f.value / data.total) * 100 : 0}%`, background: faixaColors[f.name] || '#FFB300', borderRadius: 4 }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Qualificação por Canal */}
      {sourceQualRows.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Qualificacao por Canal</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th className="right">Leads</th>
                    <th className="right">Qualif.</th>
                    <th className="right">Em Atend.</th>
                    <th className="right">Desqualif.</th>
                    <th className="right">Vendido</th>
                    <th className="right">% Qualif.</th>
                    {adSpend && <th className="right">CPL Qualif.</th>}
                  </tr>
                </thead>
                <tbody>
                  {sourceQualRows.map(([source, q]) => {
                    const qualPct = q.total > 0 ? ((q.sim / q.total) * 100).toFixed(0) : '0'
                    const channelShare = data.total > 0 ? q.total / data.total : 0
                    const channelSpend = adSpend ? adSpend * channelShare : 0
                    return (
                      <tr key={source}>
                        <td className="name">{source}</td>
                        <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{q.total}</td>
                        <td className="right" style={{ color: '#5DADE2' }}>{q.sim}</td>
                        <td className="right" style={{ color: '#FFB300' }}>{q.meio}</td>
                        <td className="right" style={{ color: '#FF6B6B' }}>{q.nao}</td>
                        <td className="right" style={{ color: '#34C759' }}>{q.vendido || 0}</td>
                        <td className="right"><span className="change-badge positive">{qualPct}%</span></td>
                        {adSpend && <td className="right" style={{ color: '#FFAA83' }}>{q.sim > 0 ? formatBRL(channelSpend / q.sim) : '—'}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Daily */}
      {dailyData.length > 1 && (
        <section className="dash-section">
          <div className="chart-card">
            <h3>Leads por Dia</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs><linearGradient id="samecoGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFB300" stopOpacity={0.35} /><stop offset="100%" stopColor="#FFB300" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} /><YAxis tick={{ fontSize: 11, fill: '#6B6580' }} allowDecimals={false} />
                <Tooltip content={<Tip />} /><Area type="monotone" dataKey="Leads" stroke="#FFB300" fill="url(#samecoGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  )
}

// ========== LUDUS CRM ==========
function LudusCRM({ data, days, adSpend }: { data: CRMData; days: number; adSpend?: number }) {
  const totalVendas = data.totalVendas || 0
  const totalValor = data.totalValor || 0
  const ticketMedio = data.ticketMedio || 0
  const prev = data.previous as any || {}
  const canalStats = data.canalStats || {}
  const personalStats = data.personalStats || {}
  const comercialStats = data.comercialStats || {}
  const dailySales = data.dailySales || []

  const canalRows = Object.entries(canalStats)
    .sort((a, b) => b[1].vendas - a[1].vendas)

  const personalRows = Object.entries(personalStats)
    .filter(([k]) => k && k !== 'Não atribuído' && k.trim() !== '')
    .sort((a, b) => b[1].vendas - a[1].vendas)

  const comercialRows = Object.entries(comercialStats)
    .filter(([k]) => k && k.trim() !== '')
    .sort((a, b) => b[1].vendas - a[1].vendas)

  const dailyData = dailySales.map(d => ({ day: d.date.slice(5).replace('-', '/'), Vendas: d.count, Valor: d.valor }))

  const CANAL_COLORS: Record<string, string> = {
    'Presencial': '#34C759',
    'Instagram': '#FF6B8A',
    'WhatsApp': '#5DADE2',
    'Facebook': '#FFB300',
    'Indicação': '#9B59B6',
    'Site': '#FFAA83',
  }

  const canalChartData = canalRows.map(([name, s]) => ({ name, value: s.vendas }))

  return (
    <div className="crm-section">
      <section className="dash-section">
        <div className="section-title">CRM — Vendas ({days} dias)</div>
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Stat label="Total de Vendas" value={totalVendas} sub={`Últimos ${days} dias`} icon={<Users size={16} />} color="#34C759" current={totalVendas} previous={prev.totalVendas} />
          <Stat label="Receita Total" value={formatBRL(totalValor)} sub={`${totalVendas} pacotes vendidos`} icon={<TrendingUp size={16} />} color="#FFB300" current={totalValor} previous={prev.totalValor} />
          <Stat label="Ticket Médio" value={formatBRL(ticketMedio)} sub="Valor médio por venda" icon={<UserCheck size={16} />} color="#5DADE2" current={ticketMedio} previous={prev.ticketMedio} />
          {adSpend != null && adSpend > 0 && totalVendas > 0 && (
            <Stat label="CAC (Custo/Venda)" value={formatBRL(adSpend / totalVendas)} sub={`${formatBRL(adSpend)} investido`} icon={<TrendingDown size={16} />} color="#FFAA83" />
          )}
          {adSpend != null && adSpend > 0 && totalValor > 0 && (
            <Stat label="ROAS" value={`${(totalValor / adSpend).toFixed(1)}x`} sub={`${formatBRL(totalValor)} / ${formatBRL(adSpend)}`} icon={<TrendingUp size={16} />} color={totalValor / adSpend >= 3 ? '#34C759' : totalValor / adSpend >= 1 ? '#FFB300' : '#FF6B6B'} />
          )}
        </div>
      </section>

      {/* Vendas por Canal */}
      {canalRows.length > 0 && (
        <section className="dash-section">
          <div className="charts-grid">
            <div className="table-card">
              <div className="table-header"><h3>Vendas por Canal</h3></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="campaign-table">
                  <thead>
                    <tr>
                      <th>Canal</th>
                      <th className="right">Vendas</th>
                      <th className="right">%</th>
                      <th className="right">Receita</th>
                      <th className="right">Ticket Médio</th>
                      <th style={{ width: '25%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {canalRows.map(([canal, s]) => (
                      <tr key={canal}>
                        <td className="name" style={{ color: CANAL_COLORS[canal] || '#fff' }}>{canal}</td>
                        <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{s.vendas}</td>
                        <td className="right">{totalVendas > 0 ? ((s.vendas / totalVendas) * 100).toFixed(0) : 0}%</td>
                        <td className="right" style={{ color: '#34C759' }}>{formatBRL(s.valor)}</td>
                        <td className="right">{s.vendas > 0 ? formatBRL(s.valor / s.vendas) : '—'}</td>
                        <td>
                          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${totalVendas > 0 ? (s.vendas / totalVendas) * 100 : 0}%`, background: CANAL_COLORS[canal] || '#FFB300', borderRadius: 4 }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="chart-card">
              <h3>Distribuição por Canal</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={canalChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {canalChartData.map((entry, i) => <Cell key={i} fill={CANAL_COLORS[entry.name] || SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Vendas por Personal */}
      {personalRows.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Vendas por Personal</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Personal</th>
                    <th className="right">Vendas</th>
                    <th className="right">Receita</th>
                    <th className="right">Ticket Médio</th>
                    <th className="right">% Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {personalRows.map(([name, s]) => (
                    <tr key={name}>
                      <td className="name">{name}</td>
                      <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{s.vendas}</td>
                      <td className="right" style={{ color: '#34C759' }}>{formatBRL(s.valor)}</td>
                      <td className="right">{s.vendas > 0 ? formatBRL(s.valor / s.vendas) : '—'}</td>
                      <td className="right"><span className="change-badge positive">{totalVendas > 0 ? ((s.vendas / totalVendas) * 100).toFixed(0) : 0}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Vendas por Comercial */}
      {comercialRows.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Vendas por Comercial</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Comercial</th>
                    <th className="right">Vendas</th>
                    <th className="right">Receita</th>
                    <th className="right">Ticket Medio</th>
                    <th className="right">% Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {comercialRows.map(([name, s]: any) => (
                    <tr key={name}>
                      <td className="name">{name}</td>
                      <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{s.vendas}</td>
                      <td className="right" style={{ color: '#34C759' }}>{formatBRL(s.valor)}</td>
                      <td className="right">{s.vendas > 0 ? formatBRL(s.valor / s.vendas) : '-'}</td>
                      <td className="right"><span className="change-badge positive">{totalVendas > 0 ? ((s.vendas / totalVendas) * 100).toFixed(0) : 0}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Vendas por Dia */}
      {dailyData.length > 1 && (
        <section className="dash-section">
          <div className="chart-card">
            <h3>Vendas por Dia</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs><linearGradient id="ludusGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34C759" stopOpacity={0.35} /><stop offset="100%" stopColor="#34C759" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} /><YAxis tick={{ fontSize: 11, fill: '#6B6580' }} allowDecimals={false} />
                <Tooltip content={<Tip />} /><Area type="monotone" dataKey="Vendas" stroke="#34C759" fill="url(#ludusGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  )
}

// ========== MAIN CRM VIEW ==========
// ========== FERNANDO CORREA CRM ==========
function FernandoCRM({ data, days, adSpend }: { data: any; days: number; adSpend?: number }) {
  const total = data.total || 0
  const qualificados = data.qualificados || 0
  const desqualificados = data.desqualificados || 0
  const emAtendimento = data.emAtendimento || 0
  const semRetorno = data.semRetorno || 0
  const locacaoCount = data.locacaoCount || 0
  const qualRate = data.qualRate || '0'
  const semRetornoRate = data.semRetornoRate || '0'
  const prev = data.previous || {}
  const origemStats: Record<string, any> = data.origemStats || {}
  const imovelStats: Record<string, any> = data.imovelStats || {}

  const cpl = adSpend && total > 0 ? adSpend / total : 0
  const cplQual = adSpend && qualificados > 0 ? adSpend / qualificados : 0

  // Origem pie
  const origemData = Object.entries(origemStats).map(([name, info]: any, i) => ({
    name, value: info.total, qualificado: info.qualificado, fill: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }))

  // Imovel bar data
  const imovelData = Object.entries(imovelStats)
    .filter(([k]) => k && k !== 'Outro')
    .sort((a: any, b: any) => b[1].total - a[1].total)
    .map(([name, info]: any, i) => ({
      name: name.length > 25 ? name.slice(0, 25) + '...' : name,
      total: info.total,
      qualificado: info.qualificado,
      desqualificado: info.desqualificado,
      fill: SOURCE_COLORS[i % SOURCE_COLORS.length],
    }))

  const dailyData = (data.dailyLeads || []).map((d: any) => ({ day: d.date.slice(5), Leads: d.count }))

  return (
    <div className="crm-section">
      <section className="dash-section">
        <div className="section-title">CRM — Leads ({days} dias)</div>
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Stat label="Total de Leads" value={total} sub={`Ultimos ${days} dias`} icon={<Users size={16} />} color="#FFB300" current={total} previous={prev.total} />
          <Stat label="Qualificados" value={qualificados} sub={`${qualRate}% do total`} icon={<UserCheck size={16} />} color="#34C759" current={qualificados} previous={prev.qualificados} />
          <Stat label="Desqualificados" value={desqualificados} sub={`${total > 0 ? ((desqualificados / total) * 100).toFixed(1) : 0}%`} icon={<UserX size={16} />} color="#FFAA83" />
          <Stat label="Sem Retorno" value={semRetorno} sub={`${semRetornoRate}% do total`} icon={<Phone size={16} />} color="#FF6B6B" current={semRetorno} previous={prev.semRetorno}
            alert={parseFloat(semRetornoRate) > 30 ? 'Taxa alta de sem retorno' : undefined} />
          {locacaoCount > 0 && (
            <Stat label="Locacao (desc.)" value={locacaoCount} sub={`${total > 0 ? ((locacaoCount / total) * 100).toFixed(1) : 0}% — nao trabalha`} icon={<Key size={16} />} color="#9B96B0" />
          )}
          {adSpend && cpl > 0 && (
            <Stat label="Custo por Lead" value={formatBRL(cpl)} sub={`${formatBRL(adSpend)} / ${total} leads`} icon={<TrendingDown size={16} />} color="#FFAA83" />
          )}
          {adSpend && cplQual > 0 && (
            <Stat label="CPL Qualificado" value={formatBRL(cplQual)} sub={`${formatBRL(adSpend)} / ${qualificados} qualif.`} icon={<UserCheck size={16} />} color="#34C759" />
          )}
        </div>
      </section>

      {/* Charts row */}
      <section className="dash-section">
        <div className="charts-grid">
          {/* Funil simples */}
          <div className="chart-card">
            <h3>Funil de Qualificacao</h3>
            <div className="crm-funnel">
              {[
                { name: 'Total Leads', value: total, color: '#FFB300' },
                { name: 'Em Atendimento', value: emAtendimento, color: '#34C759' },
                { name: 'Sem Retorno', value: semRetorno, color: '#FF6B6B' },
              ].filter(s => s.value > 0).map((step, i) => {
                const maxVal = total || 1
                const width = Math.max((step.value / maxVal) * 100, 15)
                return (
                  <div key={step.name} className="crm-funnel-row">
                    <div className="crm-funnel-label">{step.name}</div>
                    <div className="crm-funnel-bar-wrap">
                      <div className="crm-funnel-bar" style={{ width: `${width}%`, background: step.color }}><span>{step.value}</span></div>
                      {i > 0 && <span className="crm-funnel-rate">{((step.value / total) * 100).toFixed(1)}%</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#34C759' }}>{qualRate}%</div>
                <div style={{ fontSize: 10, color: '#9B96B0', textTransform: 'uppercase' }}>Qualificacao</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#FF6B6B' }}>{semRetornoRate}%</div>
                <div style={{ fontSize: 10, color: '#9B96B0', textTransform: 'uppercase' }}>Sem Retorno</div>
              </div>
            </div>
          </div>

          {/* Origem pie */}
          <div className="chart-card">
            <h3>Origem dos Leads</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={origemData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {origemData.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<Tip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Imóvel table */}
      {imovelData.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Performance por Imovel</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Imovel</th>
                    <th className="right">Leads</th>
                    <th className="right">Qualificados</th>
                    <th className="right">Desqualificados</th>
                    <th className="right">% Qualif.</th>
                  </tr>
                </thead>
                <tbody>
                  {imovelData.map((im: any) => {
                    const qPct = im.total > 0 ? ((im.qualificado / im.total) * 100).toFixed(1) : '0'
                    return (
                      <tr key={im.name}>
                        <td className="name">{im.name}</td>
                        <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{im.total}</td>
                        <td className="right" style={{ color: '#34C759' }}>{im.qualificado}</td>
                        <td className="right" style={{ color: '#FFAA83' }}>{im.desqualificado}</td>
                        <td className="right"><span className={`change-badge ${parseFloat(qPct) >= 70 ? 'positive' : ''}`}>{qPct}%</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Origem table */}
      {Object.keys(origemStats).length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Performance por Origem</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th className="right">Leads</th>
                    <th className="right">Qualificados</th>
                    <th className="right">Desqualificados</th>
                    <th className="right">% Qualif.</th>
                    {adSpend && <th className="right">CPL est.</th>}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(origemStats).sort((a: any, b: any) => b[1].total - a[1].total).map(([name, s]: any) => {
                    const qPct = s.total > 0 ? ((s.qualificado / s.total) * 100).toFixed(1) : '0'
                    return (
                      <tr key={name}>
                        <td className="name">{name}</td>
                        <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{s.total}</td>
                        <td className="right" style={{ color: '#34C759' }}>{s.qualificado}</td>
                        <td className="right" style={{ color: '#FFAA83' }}>{s.desqualificado}</td>
                        <td className="right"><span className={`change-badge ${parseFloat(qPct) >= 70 ? 'positive' : ''}`}>{qPct}%</span></td>
                        {adSpend && <td className="right">{formatBRL(adSpend * (s.total / total) / s.total)}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Daily leads */}
      {dailyData.length > 0 && (
        <section className="dash-section">
          <div className="charts-grid">
            <div className="chart-card full-width">
              <h3>Leads por Dia</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs><linearGradient id="fernandoGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFB300" stopOpacity={0.35} /><stop offset="100%" stopColor="#FFB300" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} allowDecimals={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="Leads" stroke="#FFB300" fill="url(#fernandoGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// ========== BG IMOB CRM ==========
function BGImobCRM({ data, days, adSpend }: { data: any; days: number; adSpend?: number }) {
  const total = data.total || 0
  const f = data.funnel || {}
  const prev = data.previous || {}
  const qualificados = data.qualificados || 0
  const qualRate = data.qualRate || '0'
  const naoRespRate = data.naoRespRate || '0'
  const corretorStats: Record<string, any> = data.corretorStats || {}
  const adStats: Record<string, any> = data.adStats || {}
  const platformStats: Record<string, any> = data.platformStats || {}
  const conheceBG = data.conheceBGStats || { sim: 0, nao: 0 }

  const cpl = adSpend && total > 0 ? adSpend / total : 0
  const cplQual = adSpend && qualificados > 0 ? adSpend / qualificados : 0
  const cpVisita = adSpend && f.visita > 0 ? adSpend / f.visita : 0
  const cpVenda = adSpend && f.comprou > 0 ? adSpend / f.comprou : 0

  // Funnel data for chart
  const funnelSteps = [
    { name: 'Total Leads', value: total, color: '#FFB300' },
    { name: 'Em Atendimento', value: f.emAtendimento || 0, color: '#5DADE2' },
    { name: 'Nao Respondeu', value: f.naoRespondeu || 0, color: '#FF6B6B' },
    { name: 'Visita', value: f.visita || 0, color: '#34C759' },
    { name: 'Proposta', value: f.proposta || 0, color: '#9B59B6' },
    { name: 'Comprou', value: f.comprou || 0, color: '#2ECC71' },
  ].filter(s => s.value > 0)

  // Corretor rows sorted by total
  const corretorRows = Object.entries(corretorStats)
    .filter(([k]) => k && k !== 'Sem corretor')
    .sort((a: any, b: any) => b[1].total - a[1].total)

  // Ad rows sorted by total
  const adRows = Object.entries(adStats)
    .filter(([k]) => k && k !== 'Sem anuncio')
    .sort((a: any, b: any) => b[1].total - a[1].total)

  // Platform pie
  const platformData = Object.entries(platformStats).map(([name, info]: any, i) => ({
    name, value: info.total, qualificado: info.qualificado, fill: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }))

  // Conhece BG pie
  const conheceData = [
    { name: 'Sim', value: conheceBG.sim, fill: '#34C759' },
    { name: 'Nao', value: conheceBG.nao, fill: '#FF6B8A' },
  ].filter(d => d.value > 0)

  const dailyData = (data.dailyLeads || []).map((d: any) => ({ day: d.date.slice(5), Leads: d.count }))

  return (
    <div className="crm-section">
      {/* KPI Cards */}
      <section className="dash-section">
        <div className="section-title">CRM — Leads Formulario ({days} dias)</div>
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Stat label="Total de Leads" value={total} sub={`Ultimos ${days} dias`} icon={<Users size={16} />} color="#FFB300" current={total} previous={prev.total} />
          <Stat label="Qualificados" value={qualificados} sub={`${qualRate}% do total`} icon={<UserCheck size={16} />} color="#34C759" current={qualificados} previous={prev.qualificados} />
          <Stat label="Nao Respondeu" value={f.naoRespondeu || 0} sub={`${naoRespRate}% do total`} icon={<Phone size={16} />} color="#FF6B6B" current={f.naoRespondeu} previous={prev.naoRespondeu}
            alert={parseFloat(naoRespRate) > 60 ? 'Taxa de nao-resposta muito alta!' : undefined} />
          <Stat label="Visitas" value={f.visita || 0} sub={`${total > 0 ? (((f.visita || 0) / total) * 100).toFixed(1) : 0}%`} icon={<Eye size={16} />} color="#5DADE2" />
          <Stat label="Propostas" value={f.proposta || 0} sub={`${total > 0 ? (((f.proposta || 0) / total) * 100).toFixed(1) : 0}%`} icon={<Home size={16} />} color="#9B59B6" />
          <Stat label="Comprou" value={f.comprou || 0} sub={`${total > 0 ? (((f.comprou || 0) / total) * 100).toFixed(1) : 0}%`} icon={<ShoppingCart size={16} />} color="#2ECC71" />
        </div>
      </section>

      {/* Cross-metrics with Ads */}
      {adSpend && adSpend > 0 && (
        <section className="dash-section">
          <div className="section-title" style={{ fontSize: 13 }}>Cruzamento Meta Ads x CRM</div>
          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {cpl > 0 && <Stat label="CPL (Custo por Lead)" value={formatBRL(cpl)} sub={`${formatBRL(adSpend)} / ${total} leads`} icon={<TrendingDown size={16} />} color="#FFAA83" />}
            {cplQual > 0 && <Stat label="CPL Qualificado" value={formatBRL(cplQual)} sub={`${formatBRL(adSpend)} / ${qualificados} qualif.`} icon={<UserCheck size={16} />} color="#34C759" />}
            {cpVisita > 0 && <Stat label="Custo por Visita" value={formatBRL(cpVisita)} sub={`${f.visita} visitas`} icon={<Eye size={16} />} color="#5DADE2" />}
            {cpVenda > 0 && <Stat label="Custo por Venda" value={formatBRL(cpVenda)} sub={`${f.comprou} vendas`} icon={<ShoppingCart size={16} />} color="#2ECC71" />}
          </div>
        </section>
      )}

      {/* Funnel + Platform charts */}
      <section className="dash-section">
        <div className="charts-grid">
          <div className="chart-card">
            <h3>Funil de Leads</h3>
            <div className="crm-funnel">
              {funnelSteps.map((step, i) => {
                const maxVal = funnelSteps[0]?.value || 1
                const width = Math.max((step.value / maxVal) * 100, 15)
                return (
                  <div key={step.name} className="crm-funnel-row">
                    <div className="crm-funnel-label">{step.name}</div>
                    <div className="crm-funnel-bar-wrap">
                      <div className="crm-funnel-bar" style={{ width: `${width}%`, background: step.color }}><span>{step.value}</span></div>
                      {i > 0 && <span className="crm-funnel-rate">{((step.value / total) * 100).toFixed(1)}%</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="chart-card">
            <h3>Plataforma & Interesse</h3>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              {/* Platform pie */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#9B96B0', marginBottom: 4 }}>Plataforma</div>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={platformData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                      {platformData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', fontSize: 10, marginTop: 4 }}>
                  {platformData.map(p => (
                    <span key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.fill, display: 'inline-block' }} />
                      {p.name} ({p.value})
                    </span>
                  ))}
                </div>
              </div>

              {/* Conhece BG pie */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#9B96B0', marginBottom: 4 }}>Conhece Bal. Gaivota?</div>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={conheceData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                      {conheceData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', fontSize: 10, marginTop: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} style={{ color: '#34C759' }} /> Sim ({conheceBG.sim})</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} style={{ color: '#FF6B8A' }} /> Nao ({conheceBG.nao})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Corretor Table */}
      {corretorRows.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Performance por Corretor</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Corretor</th>
                    <th className="right">Leads</th>
                    <th className="right">Em Atend.</th>
                    <th className="right">Nao Resp.</th>
                    <th className="right">Visitas</th>
                    <th className="right">Propostas</th>
                    <th className="right">Vendas</th>
                    <th className="right">% Qualif.</th>
                    <th className="right">% Nao Resp.</th>
                  </tr>
                </thead>
                <tbody>
                  {corretorRows.map(([name, s]: any) => {
                    const qualCount = s.emAtendimento + s.visita + s.proposta + s.comprou
                    const qualPct = s.total > 0 ? ((qualCount / s.total) * 100).toFixed(1) : '0'
                    const nrPct = s.total > 0 ? ((s.naoRespondeu / s.total) * 100).toFixed(1) : '0'
                    return (
                      <tr key={name}>
                        <td className="name">{name}</td>
                        <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{s.total}</td>
                        <td className="right">{s.emAtendimento}</td>
                        <td className="right" style={{ color: parseFloat(nrPct) > 70 ? '#FF6B6B' : undefined }}>{s.naoRespondeu}</td>
                        <td className="right">{s.visita}</td>
                        <td className="right">{s.proposta}</td>
                        <td className="right" style={{ color: s.comprou > 0 ? '#34C759' : undefined, fontWeight: s.comprou > 0 ? 700 : 400 }}>{s.comprou}</td>
                        <td className="right"><span className="change-badge positive">{qualPct}%</span></td>
                        <td className="right"><span className={`change-badge ${parseFloat(nrPct) > 60 ? 'negative' : ''}`}>{nrPct}%</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Ad Performance Table */}
      {adRows.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Performance por Anuncio</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Anuncio</th>
                    <th className="right">Leads</th>
                    <th className="right">Qualif.</th>
                    <th className="right">Nao Resp.</th>
                    <th className="right">Visitas</th>
                    <th className="right">Propostas</th>
                    <th className="right">Vendas</th>
                    <th className="right">% Qualif.</th>
                    {adSpend && <th className="right">CPL est.</th>}
                  </tr>
                </thead>
                <tbody>
                  {adRows.map(([name, s]: any) => {
                    const qualPct = s.total > 0 ? ((s.qualificado / s.total) * 100).toFixed(1) : '0'
                    const adCpl = adSpend && total > 0 ? (adSpend / total) * s.total / s.total : 0
                    return (
                      <tr key={name}>
                        <td className="name" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</td>
                        <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{s.total}</td>
                        <td className="right" style={{ color: '#34C759' }}>{s.qualificado}</td>
                        <td className="right" style={{ color: s.naoResp > s.total * 0.7 ? '#FF6B6B' : undefined }}>{s.naoResp}</td>
                        <td className="right">{s.visita}</td>
                        <td className="right">{s.proposta}</td>
                        <td className="right" style={{ color: s.comprou > 0 ? '#34C759' : undefined, fontWeight: s.comprou > 0 ? 700 : 400 }}>{s.comprou}</td>
                        <td className="right"><span className={`change-badge ${parseFloat(qualPct) >= 30 ? 'positive' : ''}`}>{qualPct}%</span></td>
                        {adSpend && <td className="right">{formatBRL(adCpl > 0 ? adSpend * (s.total / total) / s.total : 0)}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Daily Leads Chart */}
      {dailyData.length > 0 && (
        <section className="dash-section">
          <div className="charts-grid">
            <div className="chart-card full-width">
              <h3>Leads por Dia</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs><linearGradient id="bgLeadGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFB300" stopOpacity={0.35} /><stop offset="100%" stopColor="#FFB300" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} allowDecimals={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="Leads" stroke="#FFB300" fill="url(#bgLeadGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default function CRMView({ accountId, accountName, days, adSpend }: Props) {
  const [data, setData] = useState<CRMData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchCRM(accountId, accountName, days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [accountId, accountName, days])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Carregando CRM...</span></div>
  if (!data?.available) return null

  if (data.crmType === 'kellermann') return <KellermannCRM data={data} days={days} adSpend={adSpend} />
  if (data.crmType === 'sameco') return <SamecoCRM data={data} days={days} adSpend={adSpend} />
  if (data.crmType === 'ludus') return <LudusCRM data={data} days={days} adSpend={adSpend} />
  if (data.crmType === 'bgimob') return <BGImobCRM data={data} days={days} adSpend={adSpend} />
  if (data.crmType === 'fernando') return <FernandoCRM data={data} days={days} adSpend={adSpend} />

  // ========== INVISTA / GENERIC CRM ==========
  const f = data.funnel
  const p = data.previous
  const vendas = data.interestCounts['Venda'] || 0
  const locacao = data.interestCounts['Locação'] || 0
  const totalVisits = f.visited + f.visitScheduled
  const prevVisits = p.visited
  const cplReal = adSpend && data.adsLeads > 0 ? adSpend / data.adsLeads : 0
  const cpVisitaReal = adSpend && totalVisits > 0 ? adSpend / totalVisits : 0

  const funnelSteps = [
    { name: 'Total Leads', value: data.total, rate: '' },
    { name: 'Em Qualificacao', value: f.emQualificacao, rate: data.funnelRates.leadToQualified + '%' },
    { name: 'Em Atendimento', value: f.emAtendimento, rate: data.funnelRates.qualifiedToAtendimento + '%' },
    { name: 'Visitas', value: totalVisits, rate: data.funnelRates.atendimentoToVisit + '%' },
    { name: 'Sem Resposta', value: f.semResposta, rate: '' },
    { name: 'Negativa', value: f.negativa, rate: '' },
  ].filter(d => d.value > 0)

  const sourceData = Object.entries(data.sourceCounts)
    .filter(([k]) => k !== 'Sem origem' && k !== '')
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, value]) => ({ name: name.replace('Site - invistaimoveissm.com.br', 'Site'), value }))

  const agentData = Object.entries(data.agentCounts)
    .filter(([k]) => k && k !== 'Sem corretor' && !k.includes('Sem Retorno') && !k.includes('Sem resposta'))
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, value]) => ({ name: name.split(' | ')[0].split(' ').slice(0, 2).join(' '), value }))

  const dailyData = data.dailyLeads.map(d => ({ day: d.date.slice(0, 5), Leads: d.count }))

  return (
    <div className="crm-section">
      <section className="dash-section">
        <div className="section-title">CRM — Funil de Vendas ({days} dias)</div>
        <div className="metrics-grid">
          <Stat label="Total de Leads" value={data.total} sub={`Ultimos ${days} dias`} icon={<Users size={16} />} color="#FFB300" current={data.total} previous={p.total} />
          <Stat label="Em Atendimento" value={f.emAtendimento} sub={`${data.qualificationRate}% do total`} icon={<UserCheck size={16} />} color="#34C759" current={f.emAtendimento} previous={p.emAtendimento} />
          <Stat label="Visitas" value={totalVisits} sub={`${data.visitRate}% taxa de visita`} icon={<Eye size={16} />} color="#FFB300" current={totalVisits} previous={prevVisits} alert={parseFloat(data.visitRate) < 5 ? 'Taxa de visita baixa' : undefined} />
          <Stat label="Sem Resposta" value={f.semResposta} sub={`${data.noResponseRate}% do total`} icon={<Phone size={16} />} color="#FF6B6B" current={f.semResposta} previous={p.semResposta} />
          <Stat label="Interesse Compra" value={vendas} sub={`${data.total > 0 ? ((vendas / data.total) * 100).toFixed(0) : 0}% dos leads`} icon={<Home size={16} />} color="#FFAA83" />
          <Stat label="Interesse Locacao" value={locacao} sub={`${data.total > 0 ? ((locacao / data.total) * 100).toFixed(0) : 0}% dos leads`} icon={<Key size={16} />} color="#5DADE2" />
        </div>
      </section>

      <section className="dash-section">
        <div className="section-title">Qualificação & Custos Reais</div>
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {data.qualSim > 0 && <Stat label="Qualificados" value={data.qualSim} sub={`${data.total > 0 ? ((data.qualSim / data.total) * 100).toFixed(0) : 0}% dos leads`} icon={<UserCheck size={16} />} color="#34C759" />}
          {data.qualNao > 0 && <Stat label="Desqualificados" value={data.qualNao} sub={`${data.total > 0 ? ((data.qualNao / data.total) * 100).toFixed(0) : 0}% sem resposta/retorno`} icon={<UserX size={16} />} color="#FF6B6B" />}
          {data.qualMeio > 0 && <Stat label="Em Andamento" value={data.qualMeio} sub={`${data.total > 0 ? ((data.qualMeio / data.total) * 100).toFixed(0) : 0}% do total`} icon={<Users size={16} />} color="#FFAA83" />}
          {adSpend && data.qualSim > 0 && <Stat label="CPL Real (Qualificado)" value={formatBRL(adSpend / data.qualSim)} sub={`${formatBRL(adSpend)} / ${data.qualSim} qualificados`} icon={<TrendingUp size={16} />} color="#34C759" />}
          {cplReal > 0 && <Stat label="CPL Geral (Meta→CRM)" value={formatBRL(cplReal)} sub={`${data.adsLeads} leads de Ads`} icon={<TrendingUp size={16} />} color="#FFB300" />}
          {cpVisitaReal > 0 && <Stat label="Custo por Visita" value={formatBRL(cpVisitaReal)} sub="Gasto Ads / Visitas CRM" icon={<Eye size={16} />} color="#FFAA83" />}
          {data.semCorretor > 0 && <Stat label="Sem Corretor" value={data.semCorretor} sub={`${((data.semCorretor / data.total) * 100).toFixed(0)}% nao distribuidos`} icon={<UserX size={16} />} color="#FF6B6B" alert={data.semCorretor > data.total * 0.1 ? 'Leads nao distribuidos!' : undefined} />}
        </div>
      </section>

      <section className="dash-section">
        <div className="charts-grid">
          <div className="chart-card">
            <h3>Funil de Qualificacao</h3>
            <div className="crm-funnel">
              {funnelSteps.map((step, i) => {
                const maxVal = funnelSteps[0].value
                const width = maxVal > 0 ? Math.max((step.value / maxVal) * 100, 15) : 15
                return (
                  <div key={step.name} className="crm-funnel-row">
                    <div className="crm-funnel-label">{step.name}</div>
                    <div className="crm-funnel-bar-wrap">
                      <div className="crm-funnel-bar" style={{ width: `${width}%`, background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}><span>{step.value}</span></div>
                      {step.rate && <span className="crm-funnel-rate">{step.rate}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {[{ label: 'Lead→Qualif.', value: data.funnelRates.leadToQualified + '%' }, { label: 'Qualif.→Atend.', value: data.funnelRates.qualifiedToAtendimento + '%' }, { label: 'Atend.→Visita', value: data.funnelRates.atendimentoToVisit + '%' }].map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9B96B0', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 4 }}>
                  <span>{r.label}</span><ArrowRight size={8} /><span style={{ fontWeight: 700, color: '#fff' }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-card">
            <h3>Origem dos Leads</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {sourceData.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<Tip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#FFAA83' }}>{vendas}</div><div style={{ fontSize: 10, color: '#9B96B0', textTransform: 'uppercase' }}>Compra</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#5DADE2' }}>{locacao}</div><div style={{ fontSize: 10, color: '#9B96B0', textTransform: 'uppercase' }}>Locacao</div></div>
            </div>
          </div>
        </div>
      </section>

      {data.perSource.length > 0 && (
        <section className="dash-section">
          <div className="table-card">
            <div className="table-header"><h3>Qualificacao por Canal</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="campaign-table">
                <thead><tr><th>Canal</th><th className="right">Leads</th><th className="right">Compra</th><th className="right">Locacao</th><th className="right">Atendimento</th><th className="right">Sem Resp.</th><th className="right">Visitas</th><th className="right">Qualificacao</th><th className="right">Score</th></tr></thead>
                <tbody>
                  {data.perSource.map(s => {
                    const score = parseFloat(s.qualRate) * 0.5 + parseFloat(s.visitRate) * 0.3 + (s.semResposta === 0 ? 20 : Math.max(0, 20 - (s.semResposta / s.total) * 100))
                    const scoreColor = score >= 40 ? '#34C759' : score >= 20 ? '#FFB300' : '#FF6B6B'
                    const scoreLabel = score >= 40 ? 'A' : score >= 20 ? 'B' : 'C'
                    return (
                      <tr key={s.source}>
                        <td className="name">{s.source}</td>
                        <td className="right" style={{ fontWeight: 600, color: '#fff' }}>{s.total}</td>
                        <td className="right">{s.venda}</td><td className="right">{s.locacao}</td>
                        <td className="right">{s.emAtendimento}</td>
                        <td className="right" style={{ color: s.semResposta > s.total * 0.2 ? '#FF6B6B' : undefined }}>{s.semResposta}</td>
                        <td className="right">{s.visited}</td>
                        <td className="right"><span className="change-badge positive">{s.qualRate}%</span></td>
                        <td className="right"><span style={{ display: 'inline-block', width: 24, height: 24, lineHeight: '24px', textAlign: 'center', borderRadius: '50%', fontSize: 11, fontWeight: 700, background: `${scoreColor}20`, color: scoreColor }}>{scoreLabel}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="dash-section">
        <div className="charts-grid">
          <div className="chart-card">
            <h3>Leads por Dia</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs><linearGradient id="leadGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFB300" stopOpacity={0.35} /><stop offset="100%" stopColor="#FFB300" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} /><YAxis tick={{ fontSize: 11, fill: '#6B6580' }} allowDecimals={false} />
                <Tooltip content={<Tip />} /><Area type="monotone" dataKey="Leads" stroke="#FFB300" fill="url(#leadGrad2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {agentData.length > 0 && (
            <div className="chart-card">
              <h3>Leads por Corretor</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, agentData.length * 32)}>
                <BarChart data={agentData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                  <defs><linearGradient id="agentGrad2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#FFB300" /><stop offset="100%" stopColor="#FFAA83" /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6B6580' }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9B96B0' }} width={95} />
                  <Tooltip content={<Tip />} /><Bar dataKey="value" name="Leads" fill="url(#agentGrad2)" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
