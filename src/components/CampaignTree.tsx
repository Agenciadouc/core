import { Fragment, useState, useEffect } from 'react'
import { ChevronRight, Eye, Loader2 } from 'lucide-react'
import {
  formatBRL, formatNumber, formatPercent, getAction, pctChange,
  fetchAdsets, fetchAds, fetchAdPreview,
  type MetaInsight, type MetaAdset, type MetaAd, type AdPreviewFormat,
} from '../lib/api'

interface Props {
  currentCampaigns: MetaInsight[]
  previousCampaigns: MetaInsight[]
  days: number
  since?: string
  until?: string
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
  if (n.includes('topo') || n.includes('awareness') || (n.includes('[eng]') && !n.includes('fundo') && !n.includes('meio'))) return 'TOPO'
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

function computeResult(insight: MetaInsight | null | undefined, prevInsight?: MetaInsight | null) {
  if (!insight) return { text: '-', count: 0, prev: 0, cost: '-' }
  const spend = parseFloat(insight.spend || '0')
  const messaging = getAction(insight.actions, 'onsite_conversion.messaging_conversation_started_7d')
  const leads = getAction(insight.actions, 'lead') || getAction(insight.actions, 'onsite_conversion.lead_grouped')
  const purchases = getAction(insight.actions, 'purchase')

  const prevMessaging = prevInsight ? getAction(prevInsight.actions, 'onsite_conversion.messaging_conversation_started_7d') : 0
  const prevLeads = prevInsight ? (getAction(prevInsight.actions, 'lead') || getAction(prevInsight.actions, 'onsite_conversion.lead_grouped')) : 0
  const prevPurchases = prevInsight ? getAction(prevInsight.actions, 'purchase') : 0

  if (purchases > 0) return { text: `${formatNumber(purchases)} venda${purchases > 1 ? 's' : ''}`, count: purchases, prev: prevPurchases, cost: formatBRL(spend / purchases) }
  if (leads > 0)    return { text: `${formatNumber(leads)} lead${leads > 1 ? 's' : ''}`,      count: leads,    prev: prevLeads,    cost: formatBRL(spend / leads) }
  if (messaging > 0) return { text: `${formatNumber(messaging)} conversa${messaging > 1 ? 's' : ''}`, count: messaging, prev: prevMessaging, cost: formatBRL(spend / messaging) }
  return { text: '-', count: 0, prev: 0, cost: '-' }
}

// -------------------- Ad Row --------------------
function AdRow({ ad, onPreview }: { ad: MetaAd; onPreview: (adId: string, name: string) => void }) {
  const insight = ad.insight
  const spend = insight ? parseFloat(insight.spend || '0') : 0
  const impressions = insight ? parseInt(insight.impressions || '0') : 0
  const linkClicks = insight ? getAction(insight.actions, 'link_click') : 0
  const ctr = insight ? parseFloat(insight.ctr || '0') : 0
  const result = computeResult(insight)
  const isActive = ad.effective_status === 'ACTIVE'
  const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url

  return (
    <tr className="tree-row tree-ad">
      <td className="name" style={{ paddingLeft: 62 }}>
        <div className="tree-ad-name">
          {thumb ? (
            <img src={thumb} alt="" className="tree-ad-thumb" />
          ) : (
            <div className="tree-ad-thumb tree-ad-thumb-empty">?</div>
          )}
          <div>
            <div className="tree-ad-title" title={ad.name}>{ad.name || '(sem nome)'}</div>
            <div className="tree-ad-meta">
              <span className={`status-dot ${isActive ? 'on' : 'off'}`} /> {ad.effective_status || '-'}
            </div>
          </div>
        </div>
      </td>
      <td className="right">{formatBRL(spend)}</td>
      <td className="right">{formatNumber(impressions)}</td>
      <td className="right">{formatNumber(linkClicks)}</td>
      <td className="right">{formatPercent(ctr)}</td>
      <td className="right">{result.text}</td>
      <td className="right">{result.cost}</td>
      <td className="right">
        <button className="btn-preview" onClick={() => onPreview(ad.id, ad.name || 'Ad')}>
          <Eye size={13} /> Preview
        </button>
      </td>
    </tr>
  )
}

// -------------------- Adset Row (expansivel — carrega ads) --------------------
function AdsetRow({ adset, days, since, until, onPreview }: {
  adset: MetaAdset
  days: number
  since?: string
  until?: string
  onPreview: (adId: string, name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ads, setAds] = useState<MetaAd[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const toggle = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (ads === null) {
      setLoading(true); setErr(null)
      try {
        const data = await fetchAds(adset.id, days, since, until)
        setAds(data)
      } catch (e: any) { setErr(e.message || 'Erro') }
      setLoading(false)
    }
  }

  const insight = adset.insight
  const spend = insight ? parseFloat(insight.spend || '0') : 0
  const impressions = insight ? parseInt(insight.impressions || '0') : 0
  const linkClicks = insight ? getAction(insight.actions, 'link_click') : 0
  const ctr = insight ? parseFloat(insight.ctr || '0') : 0
  const result = computeResult(insight)
  const isActive = adset.effective_status === 'ACTIVE'

  return (
    <>
      <tr className="tree-row tree-adset" onClick={toggle} style={{ cursor: 'pointer' }}>
        <td className="name" style={{ paddingLeft: 34 }}>
          <ChevronRight size={14} className={`tree-chevron ${expanded ? 'open' : ''}`} />
          <span className={`status-dot ${isActive ? 'on' : 'off'}`} style={{ marginRight: 8 }} />
          <span title={adset.name}>{adset.name}</span>
        </td>
        <td className="right">{formatBRL(spend)}</td>
        <td className="right">{formatNumber(impressions)}</td>
        <td className="right">{formatNumber(linkClicks)}</td>
        <td className="right">{formatPercent(ctr)}</td>
        <td className="right">{result.text}</td>
        <td className="right">{result.cost}</td>
        <td className="right"></td>
      </tr>
      {expanded && loading && (
        <tr className="tree-row tree-loading"><td colSpan={8} style={{ paddingLeft: 62 }}><Loader2 size={13} className="spin" /> Carregando anuncios...</td></tr>
      )}
      {expanded && err && (
        <tr className="tree-row tree-err"><td colSpan={8} style={{ paddingLeft: 62, color: 'var(--negative)' }}>Erro: {err}</td></tr>
      )}
      {expanded && ads && ads.length === 0 && (
        <tr className="tree-row tree-empty"><td colSpan={8} style={{ paddingLeft: 62, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum anuncio nesse conjunto.</td></tr>
      )}
      {expanded && ads && ads.map(ad => (
        <AdRow key={ad.id} ad={ad} onPreview={onPreview} />
      ))}
    </>
  )
}

// -------------------- Campaign Row (expansivel — carrega adsets) --------------------
function CampaignRow({ campaign, prev, days, since, until, onPreview }: {
  campaign: MetaInsight
  prev: MetaInsight | null
  days: number
  since?: string
  until?: string
  onPreview: (adId: string, name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [adsets, setAdsets] = useState<MetaAdset[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const campaignId = campaign.campaign_id

  const toggle = async () => {
    if (!campaignId) return
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (adsets === null) {
      setLoading(true); setErr(null)
      try {
        const data = await fetchAdsets(campaignId, days, since, until)
        setAdsets(data)
      } catch (e: any) { setErr(e.message || 'Erro') }
      setLoading(false)
    }
  }

  const spend = parseFloat(campaign.spend || '0')
  const prevSpend = prev ? parseFloat(prev.spend || '0') : 0
  const impressions = parseInt(campaign.impressions || '0')
  const linkClicks = getAction(campaign.actions, 'link_click')
  const ctr = parseFloat(campaign.ctr || '0')
  const result = computeResult(campaign, prev)

  return (
    <>
      <tr className="tree-row tree-campaign" onClick={toggle} style={{ cursor: 'pointer' }}>
        <td className="name" style={{ paddingLeft: 8 }} title={campaign.campaign_name}>
          <ChevronRight size={15} className={`tree-chevron ${expanded ? 'open' : ''}`} />
          <strong>{campaign.campaign_name || ''}</strong>
        </td>
        <td className="right">
          {formatBRL(spend)}
          {prev && <ChangeIndicator value={pctChange(spend, prevSpend)} />}
        </td>
        <td className="right">{formatNumber(impressions)}</td>
        <td className="right">{formatNumber(linkClicks)}</td>
        <td className="right">{formatPercent(ctr)}</td>
        <td className="right">
          {result.text}
          {prev && result.count > 0 && <ChangeIndicator value={pctChange(result.count, result.prev)} />}
        </td>
        <td className="right">{result.cost}</td>
        <td className="right"></td>
      </tr>
      {expanded && loading && (
        <tr className="tree-row tree-loading"><td colSpan={8} style={{ paddingLeft: 34 }}><Loader2 size={13} className="spin" /> Carregando conjuntos...</td></tr>
      )}
      {expanded && err && (
        <tr className="tree-row tree-err"><td colSpan={8} style={{ paddingLeft: 34, color: 'var(--negative)' }}>Erro: {err}</td></tr>
      )}
      {expanded && adsets && adsets.length === 0 && (
        <tr className="tree-row tree-empty"><td colSpan={8} style={{ paddingLeft: 34, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum conjunto nessa campanha.</td></tr>
      )}
      {expanded && adsets && adsets.map(adset => (
        <AdsetRow key={adset.id} adset={adset} days={days} since={since} until={until} onPreview={onPreview} />
      ))}
    </>
  )
}

// -------------------- Preview Modal --------------------
const PREVIEW_FORMATS: { value: AdPreviewFormat; label: string }[] = [
  { value: 'MOBILE_FEED_STANDARD',   label: 'Feed Mobile' },
  { value: 'DESKTOP_FEED_STANDARD',  label: 'Feed Desktop' },
  { value: 'INSTAGRAM_STANDARD',     label: 'Instagram Feed' },
  { value: 'INSTAGRAM_STORY',        label: 'Stories' },
  { value: 'INSTAGRAM_REELS',        label: 'Reels' },
]

function PreviewModal({ adId, adName, onClose }: { adId: string; adName: string; onClose: () => void }) {
  const [format, setFormat] = useState<AdPreviewFormat>('MOBILE_FEED_STANDARD')
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async (fmt: AdPreviewFormat) => {
    setLoading(true); setErr(null); setHtml('')
    try {
      const h = await fetchAdPreview(adId, fmt)
      setHtml(h)
    } catch (e: any) { setErr(e.message || 'Erro') }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(format) }, [])

  const onChangeFormat = (f: AdPreviewFormat) => { setFormat(f); load(f) }

  return (
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-modal-header">
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Preview do anuncio</div>
            <h4 style={{ margin: 0, fontSize: 15 }}>{adName}</h4>
          </div>
          <button className="btn-close" onClick={onClose}>x</button>
        </div>
        <div className="preview-modal-tabs">
          {PREVIEW_FORMATS.map(f => (
            <button
              key={f.value}
              onClick={() => onChangeFormat(f.value)}
              className={`preview-tab ${format === f.value ? 'active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="preview-modal-body">
          {loading && <div className="preview-loading"><Loader2 size={20} className="spin" /> Carregando preview...</div>}
          {err && <div className="preview-error">Erro: {err}</div>}
          {!loading && !err && html && (
            <div className="preview-frame" dangerouslySetInnerHTML={{ __html: html }} />
          )}
          {!loading && !err && !html && (
            <div className="preview-empty">Meta nao retornou preview pra esse formato.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// -------------------- Main Component --------------------
export default function CampaignTree({ currentCampaigns, previousCampaigns, days, since, until }: Props) {
  const [previewAd, setPreviewAd] = useState<{ id: string; name: string } | null>(null)

  if (!currentCampaigns.length) return null

  const prevMap = new Map<string, MetaInsight>()
  previousCampaigns.forEach((c) => { if (c.campaign_id) prevMap.set(c.campaign_id, c) })

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
        <h3>Campanhas / Conjuntos / Anuncios</h3>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {currentCampaigns.length} campanha{currentCampaigns.length !== 1 ? 's' : ''} — clique pra expandir
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="campaign-table campaign-tree">
          <thead>
            <tr>
              <th>Nome</th>
              <th className="right">Investimento</th>
              <th className="right">Impressoes</th>
              <th className="right">Cliques Link</th>
              <th className="right">CTR</th>
              <th className="right">Resultados</th>
              <th className="right">Custo/Resultado</th>
              <th className="right"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const stage = detectStage(c.campaign_name || '')
              const showStageHeader = stage !== lastStage
              lastStage = stage
              const prev = c.campaign_id ? prevMap.get(c.campaign_id) || null : null

              return (
                <Fragment key={`row-${c.campaign_id || i}`}>
                  {showStageHeader && (
                    <tr className="stage-row">
                      <td colSpan={8}>
                        <span className="stage-badge" style={{ color: STAGE_COLORS[stage], borderColor: STAGE_COLORS[stage] }}>
                          {stage === 'TOPO' ? 'Topo de Funil' : stage === 'MEIO' ? 'Meio de Funil' : stage === 'FUNDO' ? 'Fundo de Funil' : 'Outros'}
                        </span>
                      </td>
                    </tr>
                  )}
                  <CampaignRow
                    campaign={c}
                    prev={prev}
                    days={days}
                    since={since}
                    until={until}
                    onPreview={(id, name) => setPreviewAd({ id, name })}
                  />
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {previewAd && (
        <PreviewModal
          adId={previewAd.id}
          adName={previewAd.name}
          onClose={() => setPreviewAd(null)}
        />
      )}
    </div>
  )
}
