import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { getAction, type DailyInsight } from '../lib/api'

interface Props {
  currentData: DailyInsight[]
  previousData: DailyInsight[]
  dataKey: 'spend' | 'messaging' | 'leads'
  label: string
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#130A24',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 12,
    }}>
      <p style={{ color: '#9B96B0', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number'
            ? p.dataKey?.includes('spend') || p.name?.includes('Investido')
              ? `R$ ${p.value.toFixed(2)}`
              : p.value.toLocaleString('pt-BR')
            : p.value}
        </p>
      ))}
    </div>
  )
}

export default function SpendChart({ currentData, previousData, dataKey, label }: Props) {
  if (!currentData.length) return <div style={{ color: '#6B6580', padding: 40, textAlign: 'center' }}>Sem dados</div>

  const getValue = (d: DailyInsight) => {
    if (dataKey === 'spend') return parseFloat(d.spend)
    if (dataKey === 'messaging') return getAction(d.actions, 'onsite_conversion.messaging_conversation_started_7d')
    if (dataKey === 'leads') return getAction(d.actions, 'lead') || getAction(d.actions, 'onsite_conversion.lead_grouped')
    return 0
  }

  if (dataKey === 'messaging' || dataKey === 'leads') {
    // Bar chart comparing current vs previous
    const chartData = currentData.map((d, i) => {
      const prevItem = previousData[i]
      const day = d.date_start.slice(5)
      return {
        day,
        Atual: getValue(d),
        Anterior: prevItem ? getValue(prevItem) : 0,
      }
    })

    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="Atual" fill="#FF0AB6" radius={[3, 3, 0, 0]} barSize={12} />
          <Bar dataKey="Anterior" fill="rgba(255,10,182,0.3)" radius={[3, 3, 0, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // Area chart for spend
  const chartData = currentData.map((d, i) => {
    const prevItem = previousData[i]
    return {
      day: d.date_start.slice(5),
      'Valor Investido': getValue(d),
      'Periodo Anterior': prevItem ? getValue(prevItem) : 0,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="currentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF0AB6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#FF0AB6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="prevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFAA83" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#FFAA83" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
        <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Area type="monotone" dataKey="Periodo Anterior" stroke="#FFAA83" fill="url(#prevGrad)" strokeWidth={1.5} strokeDasharray="4 4" />
        <Area type="monotone" dataKey="Valor Investido" stroke="#FF0AB6" fill="url(#currentGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
