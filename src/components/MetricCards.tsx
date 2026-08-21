// Cards de metricas configuraveis por conta.
// Recebe lista de metric-keys (ordem configurada) + insights atual/anterior.

import { TrendingUp, TrendingDown } from 'lucide-react'
import { pctChange, type MetaInsight } from '../lib/api'
import { getMetric } from '../lib/metricsCatalog'

interface Props {
  current: MetaInsight
  previous: MetaInsight | null
  cards: string[]  // metric-keys em ordem
}

export default function MetricCards({ current, previous, cards }: Props) {
  if (!cards?.length) {
    return <div className="metrics-grid-empty">Nenhum card configurado. Clique em <b>Personalizar</b> pra escolher metricas.</div>
  }

  return (
    <div className="metrics-grid">
      {cards.map((key, idx) => {
        const def = getMetric(key)
        if (!def) return null
        const cur = def.extract(current)
        const prev = previous ? def.extract(previous) : null
        const change = prev !== null && prev !== 0 ? pctChange(cur, prev) : null
        const isFirst = idx === 0

        return (
          <div key={key} className={`metric-card ${isFirst ? 'metric-card-primary' : ''}`}>
            <div className="metric-header">
              <span className="metric-label">{def.label}</span>
            </div>
            <div className="metric-value">{def.format(cur)}</div>
            {change !== null && (
              <div className="metric-sub">
                <span className={change >= 0 ? 'positive' : 'negative'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {change >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                </span>
                <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>vs periodo anterior</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
