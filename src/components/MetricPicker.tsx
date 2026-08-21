// Dropdown com metricas categorizadas + numeracao "ordem de selecao".
// Usado em: MetricCards, FunnelChart, CampaignTable colunas, SpendChart metricas disponiveis.

import { useEffect, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { METRICS, CATEGORY_LABELS, CATEGORY_ORDER, type MetricDef } from '../lib/metricsCatalog'

interface Props {
  label: string                        // "Metricas dos cartoes", "Etapas do funil", etc
  selected: string[]                   // ordem atual (metric-keys)
  onChange: (next: string[]) => void
  singleSelect?: boolean               // se true, so 1 metrica (usado no chart default)
  allowedKeys?: string[]               // subset opcional do catalogo
}

export default function MetricPicker({ label, selected, onChange, singleSelect = false, allowedKeys }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (key: string) => {
    if (singleSelect) {
      onChange([key])
      setOpen(false)
      return
    }
    if (selected.includes(key)) {
      onChange(selected.filter(k => k !== key))
    } else {
      onChange([...selected, key])
    }
  }

  const catalog = allowedKeys ? METRICS.filter(m => allowedKeys.includes(m.key)) : METRICS

  return (
    <div className="metric-picker" ref={ref}>
      <button className="metric-picker-trigger" onClick={() => setOpen(o => !o)}>
        <Settings2 size={13} />
        {label}
      </button>
      {open && (
        <div className="metric-picker-menu">
          {!singleSelect && <div className="metric-picker-hint">A ordem de selecao define a ordem de exibicao</div>}
          {CATEGORY_ORDER.map(cat => {
            const metricsInCat = catalog.filter(m => m.category === cat)
            if (!metricsInCat.length) return null
            return (
              <div key={cat}>
                <div className="metric-picker-category">{CATEGORY_LABELS[cat]}</div>
                {metricsInCat.map((m: MetricDef) => {
                  const idx = selected.indexOf(m.key)
                  const isSel = idx >= 0
                  return (
                    <button key={m.key} onClick={() => toggle(m.key)} className={`metric-picker-item ${isSel ? 'selected' : ''}`}>
                      <span className="metric-picker-check">{isSel ? '✓' : ''}</span>
                      <span className="metric-picker-label">{m.label}</span>
                      {isSel && !singleSelect && <span className="metric-picker-order">{idx + 1}º</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
