import { useState, useEffect } from 'react'
import { fetchKiwifySales, formatBRL, formatNumber, pctChange, type KiwifySalesResponse } from '../lib/api'
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area,
} from 'recharts'
import {
  ShoppingCart, DollarSign, TrendingUp, TrendingDown, CreditCard,
  Target, RotateCcw, Wallet, Package, AlertTriangle,
} from 'lucide-react'

interface Props {
  accountName: string
  days: number
  adSpend?: number
}

const COLORS = ['#FFB300', '#34C759', '#5DADE2', '#FF6B8A', '#9B59B6', '#2ECC71']
const METHOD_LABELS: Record<string, string> = {
  credit_card: 'Cartao',
  pix: 'PIX',
  boleto: 'Boleto',
  unknown: 'Outro',
}

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#130A24', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#9B96B0', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color || '#fff', fontWeight: 600 }}>{p.name}: {typeof p.value === 'number' && p.name.toLowerCase().includes('r$') ? formatBRL(p.value) : p.value}</p>)}
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

function Stat({ label, value, sub, icon, color, current, previous, alert, invertChange }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string;
  current?: number; previous?: number; alert?: string; invertChange?: boolean
}) {
  return (
    <div className={`metric-card ${alert ? 'metric-alert' : ''}`}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon" style={{ background: `${color}20`, color }}>{icon}</div>
      </div>
      <div className="metric-value">{typeof value === 'number' ? formatNumber(value) : value}</div>
      <div className="metric-sub">
        {current !== undefined && previous !== undefined && (
          invertChange
            ? <ChangeInverted current={current} previous={previous} />
            : <Change current={current} previous={previous} />
        )}
        {sub && <span style={{ marginLeft: current !== undefined ? 6 : 0 }}>{sub}</span>}
      </div>
      {alert && <div className="metric-alert-text"><AlertTriangle size={10} /> {alert}</div>}
    </div>
  )
}

// Inverted change indicator (lower is better, e.g., refund rate, CAC)
function ChangeInverted({ current, previous }: { current: number; previous: number }) {
  const ch = pctChange(current, previous)
  if (ch === null) return null
  const pos = ch <= 0 // lower is better
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: pos ? 'rgba(52,199,89,0.12)' : 'rgba(255,107,107,0.12)', color: pos ? '#34C759' : '#FF6B6B' }}>
      {ch <= 0 ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
      {ch > 0 ? '+' : ''}{ch.toFixed(1)}%
    </span>
  )
}

export default function KiwifyView({ accountName, days, adSpend }: Props) {
  const [data, setData] = useState<KiwifySalesResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // Only show for Josi Terapeuta
  const isJosi = accountName.toLowerCase().includes('josi') || accountName.toLowerCase().includes('josiane')

  useEffect(() => {
    if (!isJosi) { setLoading(false); return }
    setLoading(true)
    fetchKiwifySales(days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [days, isJosi])

  if (!isJosi || (!loading && (!data || !data.available))) return null

  if (loading) {
    return (
      <section className="dash-section">
        <div className="section-title">Kiwify — Vendas</div>
        <div className="loading-container" style={{ minHeight: 120 }}><div className="spinner" /></div>
      </section>
    )
  }

  const cur = data!.current
  const prev = data!.previous

  // Cross-metrics with Meta Ads
  const cac = adSpend && cur.approvedCount > 0 ? adSpend / cur.approvedCount : null
  const prevCac = adSpend && prev.approvedCount > 0 ? adSpend / prev.approvedCount : null
  const roas = adSpend && adSpend > 0 ? cur.totalRevenue / adSpend : null
  const prevRoas = adSpend && adSpend > 0 ? prev.totalRevenue / adSpend : null
  const cpv = adSpend && cur.approvedCount > 0 ? adSpend / cur.approvedCount : null // same as CAC for digital products
  const lucro = adSpend ? cur.netRevenue - adSpend : null

  // Payment method pie data
  const methodData = Object.entries(cur.byMethod).map(([method, info], i) => ({
    name: METHOD_LABELS[method] || method,
    value: info.count,
    revenue: info.revenue,
    fill: COLORS[i % COLORS.length],
  }))

  // Product data
  const productData = Object.entries(cur.byProduct)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([name, info], i) => ({
      name: name.length > 30 ? name.slice(0, 30) + '...' : name,
      vendas: info.count,
      receita: info.revenue,
      fill: COLORS[i % COLORS.length],
    }))

  return (
    <section className="dash-section">
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Package size={16} /> Kiwify — Vendas ({days} dias)
      </div>

      {/* KPI Cards */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Stat label="Vendas Aprovadas" value={cur.approvedCount} icon={<ShoppingCart size={16} />} color="#34C759"
          current={cur.approvedCount} previous={prev.approvedCount} sub={`de ${cur.totalSales} total`} />
        <Stat label="Receita Bruta" value={formatBRL(cur.totalRevenue)} icon={<DollarSign size={16} />} color="#FFB300"
          current={cur.totalRevenue} previous={prev.totalRevenue} />
        <Stat label="Receita Liquida" value={formatBRL(cur.netRevenue)} icon={<Wallet size={16} />} color="#5DADE2"
          current={cur.netRevenue} previous={prev.netRevenue} />
        <Stat label="Ticket Medio" value={formatBRL(cur.ticketMedio)} icon={<CreditCard size={16} />} color="#9B59B6"
          current={cur.ticketMedio} previous={prev.ticketMedio} />
        <Stat label="Taxa Aprovacao" value={`${cur.approvalRate.toFixed(1)}%`} icon={<Target size={16} />} color="#34C759"
          current={cur.approvalRate} previous={prev.approvalRate} />
        <Stat label="Taxa Reembolso" value={`${cur.refundRate.toFixed(1)}%`} icon={<RotateCcw size={16} />} color="#FF6B6B"
          current={cur.refundRate} previous={prev.refundRate} invertChange
          alert={cur.refundRate > 10 ? `Reembolso alto: ${cur.refundedCount} pedidos` : undefined} />
      </div>

      {/* Cross-metrics with Meta Ads */}
      {adSpend !== undefined && adSpend > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 24, fontSize: 13 }}>
            Cruzamento Meta Ads x Kiwify
          </div>
          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Stat label="Investimento Ads" value={formatBRL(adSpend)} icon={<DollarSign size={16} />} color="#FFAA83" />
            {roas !== null && (
              <Stat label="ROAS" value={`${roas.toFixed(2)}x`} icon={<TrendingUp size={16} />}
                color={roas >= 2 ? '#34C759' : roas >= 1 ? '#FFB300' : '#FF6B6B'}
                current={roas} previous={prevRoas ?? undefined}
                sub={roas >= 2 ? 'Saudavel' : roas >= 1 ? 'No limite' : 'Negativo'}
                alert={roas < 1 ? 'ROAS abaixo de 1 — operacao no prejuizo' : undefined} />
            )}
            {cac !== null && (
              <Stat label="CAC" value={formatBRL(cac)} icon={<Target size={16} />}
                color={cac < cur.ticketMedio * 0.3 ? '#34C759' : cac < cur.ticketMedio ? '#FFB300' : '#FF6B6B'}
                current={cac} previous={prevCac ?? undefined} invertChange
                sub={`${((cac / cur.ticketMedio) * 100).toFixed(0)}% do ticket`} />
            )}
            {lucro !== null && (
              <Stat label="Lucro Bruto" value={formatBRL(lucro)} icon={<Wallet size={16} />}
                color={lucro > 0 ? '#34C759' : '#FF6B6B'}
                alert={lucro < 0 ? 'Operacao no prejuizo no periodo' : undefined} />
            )}
          </div>
        </>
      )}

      {/* Charts Row */}
      <div className="charts-grid" style={{ marginTop: 20 }}>
        {/* Daily Sales Area Chart */}
        {cur.dailySales.length > 0 && (
          <div className="chart-card">
            <h3>Vendas Diarias</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cur.dailySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: '#9B96B0', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#9B96B0', fontSize: 10 }} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="count" name="Vendas" stroke="#34C759" fill="rgba(52,199,89,0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily Revenue Area Chart */}
        {cur.dailySales.length > 0 && (
          <div className="chart-card">
            <h3>Receita Diaria</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cur.dailySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: '#9B96B0', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#9B96B0', fontSize: 10 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="revenue" name="R$ Receita" stroke="#FFB300" fill="rgba(255,179,0,0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="charts-grid" style={{ marginTop: 12 }}>
        {/* Payment Method Pie */}
        {methodData.length > 0 && (
          <div className="chart-card">
            <h3>Metodo de Pagamento</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={methodData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
                    {methodData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {methodData.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.fill, display: 'inline-block' }} />
                      {m.name}
                    </span>
                    <span style={{ color: '#9B96B0' }}>{m.value} ({formatBRL(m.revenue)})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Products Bar Chart */}
        {productData.length > 0 && (
          <div className="chart-card">
            <h3>Produtos</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={productData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" tick={{ fill: '#9B96B0', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9B96B0', fontSize: 10 }} width={120} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="vendas" name="Vendas" fill="#5DADE2" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Balance info */}
      {data!.balance && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 24, fontSize: 12 }}>
          <span style={{ color: '#9B96B0' }}>Saldo disponivel: <strong style={{ color: '#34C759' }}>{formatBRL(data!.balance.available)}</strong></span>
          <span style={{ color: '#9B96B0' }}>Saldo pendente: <strong style={{ color: '#FFB300' }}>{formatBRL(data!.balance.pending)}</strong></span>
        </div>
      )}

      {/* Status summary */}
      {(cur.pendingCount > 0 || cur.refusedCount > 0) && (
        <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: '#9B96B0' }}>
          {cur.pendingCount > 0 && <span>Pendentes: {cur.pendingCount}</span>}
          {cur.refusedCount > 0 && <span>Recusados: {cur.refusedCount}</span>}
          {cur.refundedCount > 0 && <span>Reembolsados: {cur.refundedCount}</span>}
        </div>
      )}
    </section>
  )
}
