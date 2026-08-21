// Grafico diario configuravel: tabs em cima pra escolher metrica, barras rosas em baixo.

import { useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { type DailyInsight, type MetaInsight } from '../lib/api'
import { getMetric, METRICS_BY_KEY } from '../lib/metricsCatalog'

interface Props {
  currentData: DailyInsight[]
  previousData?: DailyInsight[]
  defaultMetric: string             // metric-key inicial
  availableMetrics: string[]        // metric-keys que aparecem como tabs
}

function CustomTooltip({ active, payload, label, formatFn }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#130A24', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 140,
    }}>
      <p style={{ color: '#9B96B0', marginBottom: 6, fontSize: 11 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill, fontWeight: 600, marginTop: 2 }}>
          {p.name}: <span style={{ color: '#fff' }}>{formatFn ? formatFn(p.value) : p.value.toLocaleString('pt-BR')}</span>
        </p>
      ))}
    </div>
  )
}

export default function SpendChart({ currentData, previousData = [], defaultMetric, availableMetrics }: Props) {
  const [metricKey, setMetricKey] = useState(defaultMetric)
  const def = getMetric(metricKey)
  if (!def) return null

  const chartData = currentData.map((d, i) => {
    const prev = previousData[i]
    const day = d.date_start.slice(5)
    return {
      day,
      Atual: def.extract(d as unknown as MetaInsight),
      Anterior: prev ? def.extract(prev as unknown as MetaInsight) : 0,
    }
  })

  const hasData = chartData.some(d => d.Atual > 0 || d.Anterior > 0)

  return (
    <div className="spend-chart">
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

      {!hasData && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sem dados de {def.label} no periodo</div>
      )}
      {hasData && (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B6580' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6B6580' }} tickFormatter={(v) => {
              if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
              if (v >= 1000) return (v / 1000).toFixed(0) + 'k'
              return String(v)
            }} />
            <Tooltip content={<CustomTooltip formatFn={def.format} />} />
            <Bar dataKey="Atual" fill="#7C3AED" radius={[4, 4, 0, 0]} maxBarSize={40} />
            {previousData.length > 0 && (
              <Bar dataKey="Anterior" fill="rgba(124, 58, 237, 0.28)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            )}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
