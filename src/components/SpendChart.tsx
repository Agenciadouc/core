// Grafico diario configuravel: tabs de metricas + toggle Barras/Linha + comparativo periodo anterior.

import { useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { BarChart3, LineChart as LineChartIcon } from 'lucide-react'
import { type DailyInsight, type MetaInsight } from '../lib/api'
import { getMetric, METRICS_BY_KEY } from '../lib/metricsCatalog'

interface Props {
  currentData: DailyInsight[]
  previousData?: DailyInsight[]
  defaultMetric: string
  availableMetrics: string[]
}

type ChartMode = 'bar' | 'line'

const COLOR_ATUAL = '#22C55E'
const COLOR_ATUAL_DIM = 'rgba(34, 197, 94, 0.25)'
const COLOR_ANTERIOR = 'rgba(180, 180, 200, 0.55)'

function CustomTooltip({ active, payload, label, formatFn }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#130A24', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 160,
    }}>
      <p style={{ color: '#9B96B0', marginBottom: 6, fontSize: 11 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.stroke || p.fill, fontWeight: 600, marginTop: 2 }}>
          {p.name}: <span style={{ color: '#fff' }}>{formatFn ? formatFn(p.value) : p.value.toLocaleString('pt-BR')}</span>
        </p>
      ))}
    </div>
  )
}

const yAxisFormatter = (v: number) => {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000) return (v / 1000).toFixed(0) + 'k'
  return String(v)
}

export default function SpendChart({ currentData, previousData = [], defaultMetric, availableMetrics }: Props) {
  const [metricKey, setMetricKey] = useState(defaultMetric)
  const [mode, setMode] = useState<ChartMode>('bar')
  const def = getMetric(metricKey)
  if (!def) return null

  const chartData = currentData.map((d, i) => {
    const prev = previousData[i]
    return {
      day: d.date_start.slice(5),
      Atual: def.extract(d as unknown as MetaInsight),
      Anterior: prev ? def.extract(prev as unknown as MetaInsight) : 0,
    }
  })

  const hasData = chartData.some(d => d.Atual > 0 || d.Anterior > 0)

  return (
    <div className="spend-chart">
      <div className="spend-chart-header">
        <div className="spend-chart-tabs">
          {availableMetrics.map(key => {
            const m = METRICS_BY_KEY[key]
            if (!m) return null
            return (
              <button
                key={key}
                onClick={() => setMetricKey(key)}
                className={`spend-chart-tab ${metricKey === key ? 'active' : ''}`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
        <div className="spend-chart-mode">
          <button
            onClick={() => setMode('bar')}
            className={`spend-mode-btn ${mode === 'bar' ? 'active' : ''}`}
            title="Barras"
          ><BarChart3 size={14} /></button>
          <button
            onClick={() => setMode('line')}
            className={`spend-mode-btn ${mode === 'line' ? 'active' : ''}`}
            title="Linha"
          ><LineChartIcon size={14} /></button>
        </div>
      </div>

      {!hasData && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sem dados de {def.label} no periodo</div>
      )}
      {hasData && mode === 'bar' && (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} tickFormatter={yAxisFormatter} />
            <Tooltip content={<CustomTooltip formatFn={def.format} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Atual" fill={COLOR_ATUAL} radius={[4, 4, 0, 0]} maxBarSize={40} />
            {previousData.length > 0 && (
              <Bar dataKey="Anterior" fill={COLOR_ANTERIOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
            )}
          </BarChart>
        </ResponsiveContainer>
      )}
      {hasData && mode === 'line' && (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} tickFormatter={yAxisFormatter} />
            <Tooltip content={<CustomTooltip formatFn={def.format} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {previousData.length > 0 && (
              <Line type="monotone" dataKey="Anterior" stroke={COLOR_ANTERIOR} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} activeDot={{ r: 4 }} />
            )}
            <Line type="monotone" dataKey="Atual" stroke={COLOR_ATUAL} strokeWidth={3} dot={{ r: 3, fill: COLOR_ATUAL }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
