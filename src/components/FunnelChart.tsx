// Funil configuravel — recebe lista ordenada de metric-keys.

import { type MetaInsight } from '../lib/api'
import { getMetric } from '../lib/metricsCatalog'

interface Props {
  insight: MetaInsight
  steps: string[]  // metric-keys em ordem
}

export default function FunnelChart({ insight, steps: stepKeys }: Props) {
  if (!stepKeys?.length) {
    return <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Nenhuma etapa configurada</div>
  }

  const steps = stepKeys.map(key => {
    const def = getMetric(key)
    if (!def) return null
    return { key, label: def.label, value: def.extract(insight), format: def.format }
  }).filter(Boolean) as { key: string; label: string; value: number; format: (v: number) => string }[]

  if (steps.length < 2) return <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Dados insuficientes ou etapas invalidas</div>

  const maxVal = Math.max(...steps.map(s => s.value))
  if (maxVal === 0) return <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Sem dados no periodo</div>

  return (
    <div className="funnel-container-h">
      {steps.map((step, i) => {
        const widthPct = maxVal > 0 ? (step.value / maxVal) * 100 : 0
        const prev = i > 0 ? steps[i - 1] : null
        const convRate = prev && prev.value > 0 ? (step.value / prev.value) * 100 : null

        return (
          <div key={step.key} className="funnel-row">
            <div className="funnel-row-label">{step.label}</div>
            <div className="funnel-row-track">
              <div className="funnel-row-bar" style={{ width: `${Math.max(widthPct, 3)}%` }}>
                <span className="funnel-row-value">{step.format(step.value)}</span>
              </div>
            </div>
            <div className="funnel-row-rate">
              {convRate !== null && <span>{convRate.toFixed(1)}%</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
