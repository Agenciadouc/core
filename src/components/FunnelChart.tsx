import { getAction, formatNumber, type MetaInsight } from '../lib/api'

interface Props {
  insight: MetaInsight
}

const FUNNEL_COLORS = [
  { bg: '#FF6B8A', text: '#fff' },
  { bg: '#FFAA83', text: '#fff' },
  { bg: '#9B59B6', text: '#fff' },
  { bg: '#5DADE2', text: '#fff' },
  { bg: '#34C759', text: '#fff' },
  { bg: '#FFB300', text: '#fff' },
]

export default function FunnelChart({ insight }: Props) {
  const impressions = parseInt(insight.impressions)
  const reach = parseInt(insight.reach)
  const clicks = parseInt(insight.clicks)
  const linkClicks = getAction(insight.actions, 'link_click')
  const leads = getAction(insight.actions, 'lead') || getAction(insight.actions, 'onsite_conversion.lead_grouped')
  const messaging = getAction(insight.actions, 'onsite_conversion.messaging_conversation_started_7d')
  const purchases = getAction(insight.actions, 'purchase')

  const steps: { label: string; value: number }[] = [
    { label: 'Impressoes', value: impressions },
    { label: 'Alcance', value: reach },
    { label: 'Cliques (todos)', value: clicks },
    { label: 'Cliques no link', value: linkClicks },
  ]

  if (purchases > 0) steps.push({ label: 'Vendas', value: purchases })
  else if (leads > 0 || messaging > 0) {
    const total = leads + messaging
    steps.push({ label: leads > 0 && messaging > 0 ? 'Leads + Conversas' : leads > 0 ? 'Leads' : 'Conversas', value: total })
  }

  const filtered = steps.filter((s) => s.value > 0)
  if (filtered.length < 2) return <div style={{ color: '#6B6580', padding: 40, textAlign: 'center' }}>Dados insuficientes</div>

  const maxWidth = 100
  const minWidth = 28
  const widthStep = filtered.length > 1 ? (maxWidth - minWidth) / (filtered.length - 1) : 0

  return (
    <div className="funnel-container">
      {filtered.map((step, i) => {
        const width = maxWidth - widthStep * i
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
        const convRate = i > 0 && filtered[i - 1].value > 0
          ? ((step.value / filtered[i - 1].value) * 100).toFixed(1) + '%'
          : null

        return (
          <div key={step.label} className="funnel-tier" style={{ width: `${width}%` }}>
            <div className="funnel-tier-bar" style={{ background: color.bg }}>
              <div className="funnel-tier-label">{step.label}</div>
              <div className="funnel-tier-value">{formatNumber(step.value)}</div>
            </div>
            {convRate && <div className="funnel-tier-rate">{convRate}</div>}
          </div>
        )
      })}
    </div>
  )
}
