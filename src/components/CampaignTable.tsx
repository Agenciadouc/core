import { Fragment } from 'react'
import { formatBRL, formatNumber, formatPercent, getAction, pctChange, type MetaInsight } from '../lib/api'

interface Props {
  currentCampaigns: MetaInsight[]
  previousCampaigns: MetaInsight[]
}

function ChangeIndicator({ value }: { value: number | null }) {
  if (value === null) return null
  const isPos = value >= 0
  return (
    <span className={`change-badge ${isPos ? 'positive' : 'negative'}`}>
      {isPos ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

function detectStage(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('topo') || n.includes('awareness') || n.includes('[eng]') && !n.includes('fundo') && !n.includes('meio')) return 'TOPO'
  if (n.includes('meio') || n.includes('rmkt') || n.includes('retarget')) return 'MEIO'
  if (n.includes('fundo') || n.includes('vendas') || n.includes('leads') || n.includes('wpp') || n.includes('whats') || n.includes('conversion')) return 'FUNDO'
  return 'OUTRO'
}

const STAGE_ORDER: Record<string, number> = { 'TOPO': 0, 'MEIO': 1, 'FUNDO': 2, 'OUTRO': 3 }
const STAGE_COLORS: Record<string, string> = {
  'TOPO': '#FFAA83',
  'MEIO': '#FFB70F',
  'FUNDO': '#FF0AB6',
  'OUTRO': '#6B6580',
}

export default function CampaignTable({ currentCampaigns, previousCampaigns }: Props) {
  if (!currentCampaigns.length) return null

  const prevMap = new Map<string, MetaInsight>()
  previousCampaigns.forEach((c) => { if (c.campaign_id) prevMap.set(c.campaign_id, c) })

  // Sort by funnel stage then spend
  const sorted = [...currentCampaigns].sort((a, b) => {
    const stageA = STAGE_ORDER[detectStage(a.campaign_name || '')]
    const stageB = STAGE_ORDER[detectStage(b.campaign_name || '')]
    if (stageA !== stageB) return stageA - stageB
    return parseFloat(b.spend) - parseFloat(a.spend)
  })

  let lastStage = ''

  return (
    <div className="table-card">
      <div className="table-header">
        <h3>Campanhas</h3>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {currentCampaigns.length} campanha{currentCampaigns.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="campaign-table">
          <thead>
            <tr>
              <th>Campanha</th>
              <th className="right">Investimento</th>
              <th className="right">Impressoes</th>
              <th className="right">Cliques Link</th>
              <th className="right">CTR</th>
              <th className="right">Resultados</th>
              <th className="right">Custo/Resultado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const spend = parseFloat(c.spend)
              const linkClicks = getAction(c.actions, 'link_click')
              const messaging = getAction(c.actions, 'onsite_conversion.messaging_conversation_started_7d')
              const leads = getAction(c.actions, 'lead') || getAction(c.actions, 'onsite_conversion.lead_grouped')
              const purchases = getAction(c.actions, 'purchase')
              const costPerMsg = messaging > 0 ? spend / messaging : 0

              const prev = c.campaign_id ? prevMap.get(c.campaign_id) : null
              const prevSpend = prev ? parseFloat(prev.spend) : 0
              const prevMessaging = prev ? getAction(prev.actions, 'onsite_conversion.messaging_conversation_started_7d') : 0
              const prevLeads = prev ? (getAction(prev.actions, 'lead') || getAction(prev.actions, 'onsite_conversion.lead_grouped')) : 0
              const prevPurchases = prev ? getAction(prev.actions, 'purchase') : 0

              // Determine primary result
              let resultText = '-'
              let resultCount = 0
              let prevResultCount = 0
              let costPerResult = '-'

              if (purchases > 0) {
                resultText = `${formatNumber(purchases)} venda${purchases > 1 ? 's' : ''}`
                resultCount = purchases; prevResultCount = prevPurchases
                costPerResult = formatBRL(spend / purchases)
              } else if (leads > 0) {
                resultText = `${formatNumber(leads)} lead${leads > 1 ? 's' : ''}`
                resultCount = leads; prevResultCount = prevLeads
                costPerResult = formatBRL(spend / leads)
              } else if (messaging > 0) {
                resultText = `${formatNumber(messaging)} conversa${messaging > 1 ? 's' : ''}`
                resultCount = messaging; prevResultCount = prevMessaging
                costPerResult = formatBRL(costPerMsg)
              }

              // Stage separator
              const stage = detectStage(c.campaign_name || '')
              const showStageHeader = stage !== lastStage
              lastStage = stage

              return (
                <Fragment key={`row-${c.campaign_id || i}`}>
                  {showStageHeader && (
                    <tr className="stage-row">
                      <td colSpan={7}>
                        <span className="stage-badge" style={{ color: STAGE_COLORS[stage], borderColor: STAGE_COLORS[stage] }}>
                          {stage === 'TOPO' ? 'Topo de Funil' : stage === 'MEIO' ? 'Meio de Funil' : stage === 'FUNDO' ? 'Fundo de Funil' : 'Outros'}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="name" title={c.campaign_name}>
                      {c.campaign_name || ''}
                    </td>
                    <td className="right">
                      {formatBRL(spend)}
                      {prev && <ChangeIndicator value={pctChange(spend, prevSpend)} />}
                    </td>
                    <td className="right">{formatNumber(parseInt(c.impressions))}</td>
                    <td className="right">{formatNumber(linkClicks)}</td>
                    <td className="right">{formatPercent(parseFloat(c.ctr))}</td>
                    <td className="right">
                      {resultText}
                      {prev && resultCount > 0 && <ChangeIndicator value={pctChange(resultCount, prevResultCount)} />}
                    </td>
                    <td className="right">{costPerResult}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
