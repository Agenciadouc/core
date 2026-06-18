import { formatBRL, formatNumber, formatPercent, getAction, pctChange, type MetaInsight } from '../lib/api'
import { TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick, Target, ShoppingCart, MessageCircle, Users, FileText, Radio, AlertTriangle } from 'lucide-react'

interface Props {
  current: MetaInsight
  previous: MetaInsight | null
}

interface CardProps {
  label: string
  value: string
  sub: string
  change: number | null
  icon: React.ReactNode
  color: string
  alert?: string
}

function Card({ label, value, sub, change, icon, color, alert }: CardProps) {
  const isPos = change !== null && change >= 0
  return (
    <div className={`metric-card ${alert ? 'metric-alert' : ''}`}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon" style={{ background: `${color}20`, color }}>{icon}</div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-sub">
        {change !== null && (
          <span className={isPos ? 'positive' : 'negative'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 6 }}>
            {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {isPos ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
        {sub}
      </div>
      {alert && <div className="metric-alert-text">{alert}</div>}
    </div>
  )
}

export default function MetricCards({ current, previous }: Props) {
  const c = {
    spend: parseFloat(current.spend),
    impressions: parseInt(current.impressions),
    clicks: parseInt(current.clicks),
    reach: parseInt(current.reach),
    ctr: parseFloat(current.ctr),
    cpc: parseFloat(current.cpc),
    cpm: parseFloat(current.cpm),
    frequency: parseFloat(current.frequency),
    linkClicks: getAction(current.actions, 'link_click'),
    lpv: getAction(current.actions, 'landing_page_view'),
    messaging: getAction(current.actions, 'onsite_conversion.messaging_conversation_started_7d'),
    purchases: getAction(current.actions, 'purchase'),
    leads: getAction(current.actions, 'lead') || getAction(current.actions, 'onsite_conversion.lead_grouped'),
    checkouts: getAction(current.actions, 'initiate_checkout'),
    revenue: getAction(current.action_values, 'purchase'),
    videoViews: getAction(current.actions, 'video_view'),
    saves: getAction(current.actions, 'onsite_conversion.post_save'),
    comments: getAction(current.actions, 'comment'),
    thruplay: getAction(current.actions, 'video_view'), // ThruPlay
  }

  const p = previous ? {
    spend: parseFloat(previous.spend),
    impressions: parseInt(previous.impressions),
    clicks: parseInt(previous.clicks),
    reach: parseInt(previous.reach),
    ctr: parseFloat(previous.ctr),
    cpc: parseFloat(previous.cpc),
    frequency: parseFloat(previous.frequency),
    messaging: getAction(previous.actions, 'onsite_conversion.messaging_conversation_started_7d'),
    purchases: getAction(previous.actions, 'purchase'),
    leads: getAction(previous.actions, 'lead') || getAction(previous.actions, 'onsite_conversion.lead_grouped'),
    checkouts: getAction(previous.actions, 'initiate_checkout'),
    revenue: getAction(previous.action_values, 'purchase'),
    linkClicks: getAction(previous.actions, 'link_click'),
    lpv: getAction(previous.actions, 'landing_page_view'),
  } : null

  const roas = c.spend > 0 && c.revenue > 0 ? c.revenue / c.spend : 0
  const lpvRate = c.linkClicks > 0 ? (c.lpv / c.linkClicks) * 100 : 0

  // Row 1: Core reach metrics
  const cards: CardProps[] = [
    {
      label: 'Investimento',
      value: formatBRL(c.spend),
      sub: `CPM ${formatBRL(c.cpm)}`,
      change: p ? pctChange(c.spend, p.spend) : null,
      icon: <DollarSign size={16} />,
      color: '#FF0AB6',
    },
    {
      label: 'Impressoes',
      value: formatNumber(c.impressions),
      sub: `Alcance ${formatNumber(c.reach)}`,
      change: p ? pctChange(c.impressions, p.impressions) : null,
      icon: <Eye size={16} />,
      color: '#FFAA83',
    },
    {
      label: 'Frequencia',
      value: c.frequency.toFixed(1),
      sub: p ? `Anterior: ${p.frequency.toFixed(1)}` : '',
      change: p ? pctChange(c.frequency, p.frequency) : null,
      icon: <Radio size={16} />,
      color: c.frequency > 3 ? '#FF6B6B' : '#9B59B6',
      alert: c.frequency > 3 ? 'Audiencia saturando' : c.frequency > 2.5 ? 'Atencao' : undefined,
    },
    {
      label: 'CTR',
      value: formatPercent(c.ctr),
      sub: `CPC ${formatBRL(c.cpc)}`,
      change: p ? pctChange(c.ctr, p.ctr) : null,
      icon: <Target size={16} />,
      color: '#FFB70F',
    },
    {
      label: 'Cliques no Link',
      value: formatNumber(c.linkClicks),
      sub: lpvRate > 0 ? `LPV Rate: ${lpvRate.toFixed(0)}% (${formatNumber(c.lpv)} views)` : `${formatNumber(c.lpv)} landing page views`,
      change: p ? pctChange(c.linkClicks, p.linkClicks) : null,
      icon: <MousePointerClick size={16} />,
      color: '#5DADE2',
      alert: lpvRate > 0 && lpvRate < 50 ? 'Site lento ou problema no link' : undefined,
    },
  ]

  // Conversas (WhatsApp/Messenger)
  if (c.messaging > 0) {
    const cpl = c.spend / c.messaging
    const pCpl = p && p.messaging > 0 ? p.spend / p.messaging : 0
    cards.push({
      label: 'Conversas',
      value: formatNumber(c.messaging),
      sub: `Custo ${formatBRL(cpl)}`,
      change: p ? pctChange(c.messaging, p.messaging) : null,
      icon: <MessageCircle size={16} />,
      color: '#34C759',
    })
  }

  // Leads (Facebook Lead Ads)
  if (c.leads > 0) {
    const cpl = c.spend / c.leads
    cards.push({
      label: 'Leads',
      value: formatNumber(c.leads),
      sub: `Custo ${formatBRL(cpl)}`,
      change: p ? pctChange(c.leads, p.leads) : null,
      icon: <FileText size={16} />,
      color: '#5DADE2',
    })
  }

  // Vendas
  if (c.purchases > 0) {
    cards.push({
      label: 'Vendas',
      value: `${formatNumber(c.purchases)} (${formatBRL(c.revenue)})`,
      sub: `ROAS ${roas.toFixed(2)}:1 | CPA ${formatBRL(c.spend / c.purchases)}`,
      change: p ? pctChange(c.purchases, p.purchases) : null,
      icon: <ShoppingCart size={16} />,
      color: roas >= 1 ? '#34C759' : '#FF6B6B',
      alert: roas < 1 && roas > 0 ? `ROAS negativo` : undefined,
    })
  }

  // Checkouts (sem vendas)
  if (c.checkouts > 0 && c.purchases === 0) {
    cards.push({
      label: 'Checkouts',
      value: formatNumber(c.checkouts),
      sub: `Custo ${formatBRL(c.spend / c.checkouts)}`,
      change: p ? pctChange(c.checkouts, p.checkouts) : null,
      icon: <ShoppingCart size={16} />,
      color: '#FFAA83',
    })
  }

  // Hook Rate (video views / impressions) - when there are significant video views
  if (c.videoViews > 100 && c.impressions > 0) {
    const hookRate = (c.videoViews / c.impressions) * 100
    cards.push({
      label: 'Hook Rate',
      value: hookRate.toFixed(1) + '%',
      sub: `${formatNumber(c.videoViews)} video views`,
      change: null,
      icon: <Eye size={16} />,
      color: hookRate >= 25 ? '#34C759' : hookRate >= 15 ? '#FFB70F' : '#FF6B6B',
      alert: hookRate < 15 ? 'Criativos nao prendem atencao' : undefined,
    })
  }

  return (
    <div className="metrics-grid">
      {cards.map((card) => <Card key={card.label} {...card} />)}
    </div>
  )
}
