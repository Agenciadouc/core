// Funil configuravel — visual barras horizontais coloridas (estilo antigo).

import { type MetaInsight } from '../lib/api'
import { getMetric } from '../lib/metricsCatalog'

interface Props {
  insight: MetaInsight
  steps: string[]  // metric-keys em ordem
}

// Paleta de cores por posicao no funil (mais quentes no topo, frios no meio, verde no fim)
const FUNNEL_COLORS = [
  { bg: 'linear-gradient(90deg, #FF6B8A 0%, #FF5378 100%)', fg: '#fff' },  // rosa
  { bg: 'linear-gradient(90deg, #FFAA83 0%, #FF9066 100%)', fg: '#fff' },  // laranja claro
  { bg: 'linear-gradient(90deg, #9B59B6 0%, #8548A3 100%)', fg: '#fff' },  // roxo
  { bg: 'linear-gradient(90deg, #5DADE2 0%, #3F97CE 100%)', fg: '#fff' },  // azul
  { bg: 'linear-gradient(90deg, #34C759 0%, #22A946 100%)', fg: '#fff' },  // verde
  { bg: 'linear-gradient(90deg, #FFB300 0%, #E69C00 100%)', fg: '#fff' },  // amarelo
]

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

  // Largura visual: decresce por POSICAO (funil real), nao por valor.
  // Ex: 5 etapas → 100%, 85%, 70%, 55%, 40%. Sempre visual bonito.
  // A % de conversao ao lado mostra o valor real.
  const MAX_WIDTH_PCT = 100
  const MIN_WIDTH_PCT = 40
  const step = steps.length > 1 ? (MAX_WIDTH_PCT - MIN_WIDTH_PCT) / (steps.length - 1) : 0

  return (
    <div className="funnel-classic">
      {steps.map((stepData, i) => {
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
        const width = MAX_WIDTH_PCT - (i * step)

        // Taxa de conversao vs etapa anterior (valor real)
        const prev = i > 0 ? steps[i - 1] : null
        const convRate = prev && prev.value > 0 ? (stepData.value / prev.value) * 100 : null

        return (
          <div key={stepData.key} className="funnel-classic-row">
            <div className="funnel-classic-bar-wrapper" style={{ width: `${width}%` }}>
              <div className="funnel-classic-bar" style={{ background: color.bg, color: color.fg }}>
                <div className="funnel-classic-label">{stepData.label}</div>
                <div className="funnel-classic-value">{stepData.format(stepData.value)}</div>
              </div>
            </div>
            {convRate !== null && (
              <div className="funnel-classic-rate">{convRate.toFixed(1)}%</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
