import { formatBRL, formatNumber, formatPercent, getAction, pctChange, type MetaInsight } from '../lib/api'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface Props {
  current: MetaInsight
  previous: MetaInsight | null
}

interface MetricItemProps {
  label: string
  value: string
  change: number | null
  large?: boolean
}

function MetricItem({ label, value, change, large }: MetricItemProps) {
  const isPositive = change !== null && change >= 0
  const isNegative = change !== null && change < 0

  return (
    <div className={`metric-item ${large ? 'large' : ''}`}>
      <div className="metric-item-label">{label}</div>
      <div className="metric-item-value">{value}</div>
      {change !== null && (
        <div className={`metric-item-change ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{isNegative ? '' : '+'}{change.toFixed(1)}%</span>
        </div>
      )}
    </div>
  )
}

export default function MetricGroups({ current, previous }: Props) {
  const c = {
    impressions: parseInt(current.impressions),
    frequency: parseFloat(current.frequency),
    cpm: parseFloat(current.cpm),
    ctr: parseFloat(current.ctr),
    clicks: parseInt(current.clicks),
    comments: getAction(current.actions, 'comment'),
    saves: getAction(current.actions, 'onsite_conversion.post_save'),
    linkClicks: getAction(current.actions, 'link_click'),
    spend: parseFloat(current.spend),
    messaging: getAction(current.actions, 'onsite_conversion.messaging_conversation_started_7d'),
    reach: parseInt(current.reach),
  }
  const costPerConversation = c.messaging > 0 ? c.spend / c.messaging : 0

  const p = previous ? {
    impressions: parseInt(previous.impressions),
    frequency: parseFloat(previous.frequency),
    cpm: parseFloat(previous.cpm),
    ctr: parseFloat(previous.ctr),
    clicks: parseInt(previous.clicks),
    comments: getAction(previous.actions, 'comment'),
    saves: getAction(previous.actions, 'onsite_conversion.post_save'),
    linkClicks: getAction(previous.actions, 'link_click'),
    spend: parseFloat(previous.spend),
    messaging: getAction(previous.actions, 'onsite_conversion.messaging_conversation_started_7d'),
    reach: parseInt(previous.reach),
  } : null

  const pCostPerConv = p && p.messaging > 0 ? p.spend / p.messaging : 0

  return (
    <div className="metric-groups">
      {/* Group 1: Taxas de Alcance de Publicidade */}
      <div className="metric-group">
        <div className="metric-group-title">Taxas de Alcance de Publicidade</div>
        <div className="metric-group-row">
          <MetricItem
            label="Impressoes"
            value={formatNumber(c.impressions)}
            change={p ? pctChange(c.impressions, p.impressions) : null}
            large
          />
          <MetricItem
            label="Frequencia"
            value={c.frequency.toFixed(1).replace('.', ',')}
            change={p ? pctChange(c.frequency, p.frequency) : null}
            large
          />
        </div>
        <div className="metric-group-row three">
          <MetricItem
            label="CPM"
            value={formatBRL(c.cpm)}
            change={p ? pctChange(c.cpm, p.cpm) : null}
          />
          <MetricItem
            label="CTR"
            value={c.ctr.toFixed(2).replace('.', ',')}
            change={p ? pctChange(c.ctr, p.ctr) : null}
          />
          <MetricItem
            label="Cliques (Todos)"
            value={formatNumber(c.clicks)}
            change={p ? pctChange(c.clicks, p.clicks) : null}
          />
        </div>
      </div>

      {/* Group 2: Taxas de Engajamento */}
      <div className="metric-group">
        <div className="metric-group-title">Taxas de Engajamento</div>
        <div className="metric-group-row three">
          <MetricItem
            label="Comentarios"
            value={formatNumber(c.comments)}
            change={p ? pctChange(c.comments, p.comments) : null}
            large
          />
          <MetricItem
            label="Salvaram"
            value={formatNumber(c.saves)}
            change={p ? pctChange(c.saves, p.saves) : null}
            large
          />
          <MetricItem
            label="Cliques no link"
            value={formatNumber(c.linkClicks)}
            change={p ? pctChange(c.linkClicks, p.linkClicks) : null}
            large
          />
        </div>
      </div>

      {/* Group 3: Investimento vs Resultado */}
      <div className="metric-group">
        <div className="metric-group-title">Investimento vs Resultado</div>
        <div className="metric-group-row">
          <MetricItem
            label="Valor Investido"
            value={formatBRL(c.spend)}
            change={p ? pctChange(c.spend, p.spend) : null}
            large
          />
        </div>
        <div className="metric-group-row three">
          <MetricItem
            label="Conversas Iniciadas"
            value={formatNumber(c.messaging)}
            change={p ? pctChange(c.messaging, p.messaging) : null}
          />
          <MetricItem
            label="Custo p/Conversa"
            value={costPerConversation > 0 ? formatBRL(costPerConversation) : '-'}
            change={p && pCostPerConv > 0 ? pctChange(costPerConversation, pCostPerConv) : null}
          />
          <MetricItem
            label="Alcance"
            value={formatNumber(c.reach)}
            change={p ? pctChange(c.reach, p.reach) : null}
          />
        </div>
      </div>
    </div>
  )
}
