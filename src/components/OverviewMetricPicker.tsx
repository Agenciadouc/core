// MetricPicker especifico do Overview (usa OVERVIEW_METRICS categorizados por fonte)

import { useEffect, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { OVERVIEW_METRICS, OVERVIEW_CATEGORY_LABELS, OVERVIEW_CATEGORY_ORDER, type OverviewMetricDef } from '../lib/overviewMetricsCatalog'

interface Props {
  label: string
  selected: string[]
  onChange: (next: string[]) => void
  singleSelect?: boolean
  allowedKeys?: string[]
}

export default function OverviewMetricPicker({ label, selected, onChange, singleSelect = false, allowedKeys }: Props) {
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

  const catalog = allowedKeys ? OVERVIEW_METRICS.filter(m => allowedKeys.includes(m.key)) : OVERVIEW_METRICS

  return (
    <div className="metric-picker" ref={ref}>
      <button className="metric-picker-trigger" onClick={() => setOpen(o => !o)}>
        <Settings2 size={13} />
        {label}
      </button>
      {open && (
        <div className="metric-picker-menu" style={{ minWidth: 320 }}>
          {!singleSelect && <div className="metric-picker-hint">A ordem de selecao define a ordem de exibicao</div>}
          {OVERVIEW_CATEGORY_ORDER.map(cat => {
            const metricsInCat = catalog.filter(m => m.category === cat)
            if (!metricsInCat.length) return null
            return (
              <div key={cat}>
                <div className="metric-picker-category">{OVERVIEW_CATEGORY_LABELS[cat]}</div>
                {metricsInCat.map((m: OverviewMetricDef) => {
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
