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
import type { IGDailyPoint } from '../lib/api'

interface Props {
  currentDaily: IGDailyPoint[]
  previousDaily: IGDailyPoint[]
  label: string
  color: string
  type?: 'area' | 'bar'
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
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('pt-BR') : p.value}
        </p>
      ))}
    </div>
  )
}

export default function IGChart({ currentDaily, previousDaily, label, color, type = 'area' }: Props) {
  if (!currentDaily.length) return <div style={{ color: '#6B6580', padding: 40, textAlign: 'center' }}>Sem dados</div>

  const chartData = currentDaily.map((d, i) => ({
    day: d.date?.slice(5) || `D${i + 1}`,
    Atual: d.value,
    Anterior: previousDaily[i]?.value || 0,
  }))

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="Atual" fill={color} radius={[3, 3, 0, 0]} barSize={12} />
          <Bar dataKey="Anterior" fill={`${color}50`} radius={[3, 3, 0, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
        <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Area type="monotone" dataKey="Anterior" stroke={`${color}80`} fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
        <Area type="monotone" dataKey="Atual" stroke={color} fill={`url(#grad-${label})`} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
