// Arvore de campanhas com layout horizontal (estilo Tasty Hub).
// Colunas configuraveis via prop `columns` (metric-keys).
// Cada nivel (campanha > adset > ad) expande com clique. Badges de status.

import { Fragment, useEffect, useState } from 'react'
import { ChevronRight, Eye, Loader2 } from 'lucide-react'
import {
  fetchAdsets, fetchAds, fetchAdPreview,
  type MetaInsight, type MetaAdset, type MetaAd, type AdPreviewFormat,
} from '../lib/api'
import { getMetric } from '../lib/metricsCatalog'

interface Props {
  currentCampaigns: MetaInsight[]
  previousCampaigns?: MetaInsight[]  // nao usado aqui — mantido pra compat
  days: number
  since?: string
  until?: string
  columns: string[]  // metric-keys das colunas
}

// -------------------- Status badge (ATIVA / PAUSADA / COM ERRO) --------------------
function statusInfo(effectiveStatus?: string) {
  const s = (effectiveStatus || '').toUpperCase()
  if (s === 'ACTIVE') return { label: 'Ativa', kind: 'ok' }
  if (s.includes('PAUSED')) return { label: 'Pausada', kind: 'off' }
  if (s === 'DISAPPROVED' || s === 'WITH_ISSUES') return { label: 'Com erro', kind: 'err' }
  if (s === 'PENDING_REVIEW' || s === 'IN_PROCESS') return { label: 'Em analise', kind: 'warn' }
  if (s === 'ARCHIVED' || s === 'DELETED') return { label: 'Arquivada', kind: 'off' }
  return { label: s || '-', kind: 'off' }
}

function StatusBadge({ effectiveStatus }: { effectiveStatus?: string }) {
  const info = statusInfo(effectiveStatus)
  return <span className={`status-badge kind-${info.kind}`}>{info.label}</span>
}

// -------------------- Cells de metricas --------------------
function MetricCells({ insight, columns }: { insight: MetaInsight | null | undefined; columns: string[] }) {
  return (
    <>
      {columns.map(key => {
        const def = getMetric(key)
        if (!def) return <div key={key} className="col-metric">-</div>
        const v = insight ? def.extract(insight) : 0
        return (
          <div key={key} className="col-metric">
            <div className="col-metric-label">{def.label}</div>
            <div className="col-metric-value">{insight ? def.format(v) : '-'}</div>
          </div>
        )
      })}
    </>
  )
}

// -------------------- Ad Row --------------------
function AdRow({ ad, columns, onPreview }: { ad: MetaAd; columns: string[]; onPreview: (id: string, name: string) => void }) {
  const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url
  return (
    <div className="tree-row row-ad">
      <div className="row-name" style={{ paddingLeft: 64 }}>
        {thumb ? <img src={thumb} className="ad-thumb" alt="" /> : <div className="ad-thumb ad-thumb-empty">?</div>}
        <button className="ad-preview-btn" onClick={() => onPreview(ad.id, ad.name || 'Ad')} title="Ver preview"><Eye size={14} /></button>
        <span className="row-name-text" title={ad.name}>{ad.name || '(sem nome)'}</span>
      </div>
      <div className="row-metrics"><MetricCells insight={ad.insight} columns={columns} /></div>
    </div>
  )
}

// -------------------- Adset Row --------------------
function AdsetRow({ adset, days, since, until, columns, accountId, onPreview }: {
  adset: MetaAdset & { insight: MetaInsight | null }
  days: number; since?: string; until?: string
  columns: string[]; accountId: string
  onPreview: (id: string, name: string) => void
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
        const data = await fetchAds(adset.id, days, since, until, accountId)
        setAds(data)
      } catch (e: any) { setErr(e.message) }
      setLoading(false)
    }
  }

  return (
    <>
      <div className="tree-row row-adset" onClick={toggle}>
        <div className="row-name" style={{ paddingLeft: 34 }}>
          <ChevronRight size={14} className={`tree-chev ${expanded ? 'open' : ''}`} />
          <StatusBadge effectiveStatus={adset.effective_status} />
          <span className="row-name-text" title={adset.name}>{adset.name}</span>
        </div>
        <div className="row-metrics"><MetricCells insight={adset.insight} columns={columns} /></div>
      </div>
      {expanded && loading && <div className="tree-row row-loading" style={{ paddingLeft: 64 }}><Loader2 size={13} className="spin" /> Carregando anuncios...</div>}
      {expanded && err && <div className="tree-row row-err" style={{ paddingLeft: 64 }}>Erro: {err}</div>}
      {expanded && ads && ads.length === 0 && <div className="tree-row row-empty" style={{ paddingLeft: 64 }}>Sem anuncios</div>}
      {expanded && ads && ads.map(ad => <AdRow key={ad.id} ad={ad} columns={columns} onPreview={onPreview} />)}
    </>
  )
}

// -------------------- Campaign Row --------------------
function CampaignRow({ campaign, days, since, until, columns, accountId, onPreview }: {
  campaign: MetaInsight
  days: number; since?: string; until?: string
  columns: string[]; accountId: string
  onPreview: (id: string, name: string) => void
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
        const data = await fetchAdsets(campaignId, days, since, until, accountId)
        setAdsets(data)
      } catch (e: any) { setErr(e.message) }
      setLoading(false)
    }
  }

  return (
    <>
      <div className="tree-row row-campaign" onClick={toggle}>
        <div className="row-name">
          <ChevronRight size={15} className={`tree-chev ${expanded ? 'open' : ''}`} />
          <StatusBadge effectiveStatus={(campaign as any).effective_status} />
          <strong className="row-name-text" title={campaign.campaign_name}>{campaign.campaign_name}</strong>
        </div>
        <div className="row-metrics"><MetricCells insight={campaign} columns={columns} /></div>
      </div>
      {expanded && loading && <div className="tree-row row-loading" style={{ paddingLeft: 34 }}><Loader2 size={13} className="spin" /> Carregando conjuntos...</div>}
      {expanded && err && <div className="tree-row row-err" style={{ paddingLeft: 34 }}>Erro: {err}</div>}
      {expanded && adsets && adsets.length === 0 && <div className="tree-row row-empty" style={{ paddingLeft: 34 }}>Sem conjuntos</div>}
      {expanded && adsets && adsets.map(a => (
        <AdsetRow key={a.id} adset={a as any} days={days} since={since} until={until} columns={columns} accountId={accountId} onPreview={onPreview} />
      ))}
    </>
  )
}

// -------------------- Preview Modal --------------------
const PREVIEW_FORMATS: { value: AdPreviewFormat; label: string }[] = [
  { value: 'MOBILE_FEED_STANDARD',  label: 'Feed Mobile' },
  { value: 'DESKTOP_FEED_STANDARD', label: 'Feed Desktop' },
  { value: 'INSTAGRAM_STANDARD',    label: 'Instagram Feed' },
  { value: 'INSTAGRAM_STORY',       label: 'Stories' },
  { value: 'INSTAGRAM_REELS',       label: 'Reels' },
]

function PreviewModal({ adId, adName, onClose }: { adId: string; adName: string; onClose: () => void }) {
  const [format, setFormat] = useState<AdPreviewFormat>('MOBILE_FEED_STANDARD')
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async (fmt: AdPreviewFormat) => {
    setLoading(true); setErr(null); setHtml('')
    try { setHtml(await fetchAdPreview(adId, fmt)) }
    catch (e: any) { setErr(e.message) }
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(format) }, [])

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
            <button key={f.value} onClick={() => { setFormat(f.value); load(f.value) }} className={`preview-tab ${format === f.value ? 'active' : ''}`}>{f.label}</button>
          ))}
        </div>
        <div className="preview-modal-body">
          {loading && <div className="preview-loading"><Loader2 size={20} className="spin" /> Carregando preview...</div>}
          {err && <div className="preview-error">Erro: {err}</div>}
          {!loading && !err && html && <div className="preview-frame" dangerouslySetInnerHTML={{ __html: html }} />}
          {!loading && !err && !html && <div className="preview-empty">Meta nao retornou preview pra esse formato.</div>}
        </div>
      </div>
    </div>
  )
}

// -------------------- Main --------------------
export default function CampaignTree({ currentCampaigns, days, since, until, columns }: Props) {
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null)

  if (!currentCampaigns.length) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Nenhuma campanha no periodo.</div>

  const accountId = ((currentCampaigns[0] as any).account_id) || (currentCampaigns[0].campaign_id?.split('_')[0]) || ''

  const sorted = [...currentCampaigns].sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))

  return (
    <div className="campaigns-h">
      <div className="tree-row row-header">
        <div className="row-name">Nome</div>
        <div className="row-metrics">
          {columns.map(key => {
            const def = getMetric(key)
            return <div key={key} className="col-metric-header">{def?.label || key}</div>
          })}
        </div>
      </div>
      {sorted.map((c, i) => (
        <Fragment key={c.campaign_id || i}>
          <CampaignRow
            campaign={c}
            days={days} since={since} until={until}
            columns={columns}
            accountId={accountId}
            onPreview={(id, name) => setPreview({ id, name })}
          />
        </Fragment>
      ))}
      {preview && <PreviewModal adId={preview.id} adName={preview.name} onClose={() => setPreview(null)} />}
    </div>
  )
}
