// Cards de metricas configuraveis por conta — layout com icones coloridos.

import { TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick, Target, ShoppingCart, MessageCircle, Users, Radio, FileText, TrendingUp as TU, Zap, PackagePlus, CreditCard } from 'lucide-react'
import { pctChange, type MetaInsight } from '../lib/api'
import { getMetric } from '../lib/metricsCatalog'
import type { ComponentType } from 'react'

interface Props {
  current: MetaInsight
  previous: MetaInsight | null
  cards: string[]  // metric-keys em ordem
}

// Mapa visual (icone + cor accent) por metric-key
const VISUALS: Record<string, { icon: ComponentType<{ size?: number }>; color: string }> = {
  spend:              { icon: DollarSign,        color: '#FF0AB6' },
  impressions:        { icon: Eye,               color: '#FFAA83' },
  reach:              { icon: Radio,             color: '#9B59B6' },
  frequency:          { icon: Radio,             color: '#9B59B6' },
  clicks:             { icon: MousePointerClick, color: '#5DADE2' },
  link_clicks:        { icon: MousePointerClick, color: '#5DADE2' },
  ctr:                { icon: Target,            color: '#FFB70F' },
  cpc:                { icon: Target,            color: '#FFB70F' },
  cpm:                { icon: DollarSign,        color: '#FF0AB6' },
  page_views:         { icon: Eye,               color: '#5DADE2' },
  messaging:          { icon: MessageCircle,     color: '#34C759' },
  add_to_cart:        { icon: PackagePlus,       color: '#FFAA83' },
  initiate_checkout:  { icon: CreditCard,        color: '#FFAA83' },
  purchases:          { icon: ShoppingCart,      color: '#34C759' },
  revenue:            { icon: DollarSign,        color: '#34C759' },
  roas:               { icon: TU,                color: '#34C759' },
  cost_per_purchase:  { icon: DollarSign,        color: '#FF6B6B' },
  leads:              { icon: FileText,          color: '#5DADE2' },
  video_views:        { icon: Eye,               color: '#9B59B6' },
  post_engagement:    { icon: Zap,               color: '#FFB70F' },
}

const DEFAULT_VISUAL = { icon: Users, color: '#6B6580' }

export default function MetricCards({ current, previous, cards }: Props) {
  if (!cards?.length) {
    return <div className="metrics-grid-empty">Nenhum card configurado. Clique em <b>Personalizar</b> pra escolher metricas.</div>
  }

  return (
    <div className="metrics-grid">
      {cards.map(key => {
        const def = getMetric(key)
        if (!def) return null
        const cur = def.extract(current)
        const prev = previous ? def.extract(previous) : null
        const change = prev !== null && prev !== 0 ? pctChange(cur, prev) : null
        const visual = VISUALS[key] || DEFAULT_VISUAL
        const Icon = visual.icon
        const isPos = change !== null && change >= 0

        return (
          <div key={key} className="metric-card">
            <div className="metric-header">
              <span className="metric-label">{def.label}</span>
              <div className="metric-icon" style={{ background: `${visual.color}20`, color: visual.color }}>
                <Icon size={14} />
              </div>
            </div>
            <div className="metric-value">{def.format(cur)}</div>
            {change !== null && (
              <div className="metric-sub">
                <span className={isPos ? 'positive' : 'negative'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {isPos ? '+' : ''}{change.toFixed(1)}%
                </span>
                <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>vs anterior</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
