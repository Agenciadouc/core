import { useState, useEffect } from 'react'
import { Loader2, Eye, TrendingUp, DollarSign, MousePointerClick, ShoppingCart, MessageCircle, Users } from 'lucide-react'
import {
  fetchTopAds, fetchAdPreview,
  formatBRL, formatNumber, formatPercent, getAction,
  type MetaTopAd, type AdPreviewFormat,
} from '../lib/api'

interface Props {
  accountId: string
  days: number
  since?: string
  until?: string
}

type SortKey = 'spend' | 'ctr' | 'clicks' | 'purchases' | 'messaging' | 'leads' | 'impressions'

const SORT_OPTIONS: { key: SortKey; label: string; icon: any }[] = [
  { key: 'spend',      label: 'Investimento',   icon: DollarSign },
  { key: 'ctr',        label: 'CTR',            icon: TrendingUp },
  { key: 'clicks',     label: 'Cliques Link',   icon: MousePointerClick },
  { key: 'purchases',  label: 'Compras',        icon: ShoppingCart },
  { key: 'messaging',  label: 'Conversas',      icon: MessageCircle },
  { key: 'leads',      label: 'Leads',          icon: Users },
]

function extractValue(ad: MetaTopAd, key: SortKey): number {
  const ins = ad.insight
  if (!ins) return 0
  switch (key) {
    case 'spend':       return parseFloat(ins.spend || '0')
    case 'ctr':         return parseFloat(ins.ctr || '0')
    case 'clicks':      return getAction(ins.actions, 'link_click')
    case 'purchases':   return getAction(ins.actions, 'purchase')
    case 'messaging':   return getAction(ins.actions, 'onsite_conversion.messaging_conversation_started_7d')
    case 'leads':       return getAction(ins.actions, 'lead') || getAction(ins.actions, 'onsite_conversion.lead_grouped')
    case 'impressions': return parseInt(ins.impressions || '0')
    default:            return 0
  }
}

// ---------- Preview Modal (reusa da CampaignTree) ----------
const PREVIEW_FORMATS: { value: AdPreviewFormat; label: string }[] = [
  { value: 'MOBILE_FEED_STANDARD',   label: 'Feed Mobile' },
  { value: 'DESKTOP_FEED_STANDARD',  label: 'Feed Desktop' },
  { value: 'INSTAGRAM_STANDARD',     label: 'Instagram Feed' },
  { value: 'INSTAGRAM_STORY',        label: 'Stories' },
  { value: 'INSTAGRAM_REELS',        label: 'Reels' },
]

function PreviewModal({ adId, adName, onClose }: { adId: string; adName: string; onClose: () => void }) {
  const [format, setFormat] = useState<AdPreviewFormat>('MOBILE_FEED_STANDARD')
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async (fmt: AdPreviewFormat) => {
    setLoading(true); setErr(null); setHtml('')
    try { setHtml(await fetchAdPreview(adId, fmt)) }
    catch (e: any) { setErr(e.message || 'Erro') }
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

// ---------- Creative Card ----------
function CreativeCard({ ad, sortKey, onPreview }: {
  ad: MetaTopAd
  sortKey: SortKey
  onPreview: (adId: string, name: string) => void
}) {
  const ins = ad.insight
  const spend = ins ? parseFloat(ins.spend || '0') : 0
  const impressions = ins ? parseInt(ins.impressions || '0') : 0
  const clicks = ins ? getAction(ins.actions, 'link_click') : 0
  const ctr = ins ? parseFloat(ins.ctr || '0') : 0
  const purchases = ins ? getAction(ins.actions, 'purchase') : 0
  const messaging = ins ? getAction(ins.actions, 'onsite_conversion.messaging_conversation_started_7d') : 0
  const leads = ins ? (getAction(ins.actions, 'lead') || getAction(ins.actions, 'onsite_conversion.lead_grouped')) : 0

  const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url
  const isActive = ad.effective_status === 'ACTIVE'

  return (
    <div className="creative-card">
      <button className="creative-thumb" onClick={() => onPreview(ad.id, ad.name || 'Ad')} title="Ver preview">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" />
        ) : (
          <div className="creative-thumb-empty">?</div>
        )}
        <div className="creative-thumb-overlay">
          <Eye size={22} />
          <span>Ver preview</span>
        </div>
      </button>

      <div className="creative-body">
        <div className="creative-title" title={ad.name}>{ad.name || '(sem nome)'}</div>
        <div className="creative-status">
          <span className={`status-dot ${isActive ? 'on' : 'off'}`} />
          {ad.effective_status || '-'}
        </div>

        <div className="creative-metrics">
          <div className={`metric ${sortKey === 'spend' ? 'is-active' : ''}`}>
            <div className="metric-label">Investido</div>
            <div className="metric-value">{formatBRL(spend)}</div>
          </div>
          <div className={`metric ${sortKey === 'ctr' ? 'is-active' : ''}`}>
            <div className="metric-label">CTR</div>
            <div className="metric-value">{formatPercent(ctr)}</div>
          </div>
          <div className={`metric ${sortKey === 'clicks' ? 'is-active' : ''}`}>
            <div className="metric-label">Cliques</div>
            <div className="metric-value">{formatNumber(clicks)}</div>
          </div>
          <div className={`metric ${sortKey === 'impressions' ? 'is-active' : ''}`}>
            <div className="metric-label">Impressoes</div>
            <div className="metric-value">{formatNumber(impressions)}</div>
          </div>
          {purchases > 0 && (
            <div className={`metric ${sortKey === 'purchases' ? 'is-active' : ''}`}>
              <div className="metric-label">Compras</div>
              <div className="metric-value">{formatNumber(purchases)}</div>
            </div>
          )}
          {messaging > 0 && (
            <div className={`metric ${sortKey === 'messaging' ? 'is-active' : ''}`}>
              <div className="metric-label">Conversas</div>
              <div className="metric-value">{formatNumber(messaging)}</div>
            </div>
          )}
          {leads > 0 && (
            <div className={`metric ${sortKey === 'leads' ? 'is-active' : ''}`}>
              <div className="metric-label">Leads</div>
              <div className="metric-value">{formatNumber(leads)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Main ----------
export default function TopCreatives({ accountId, days, since, until }: Props) {
  const [ads, setAds] = useState<MetaTopAd[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true); setErr(null)
    fetchTopAds(accountId, days, since, until)
      .then(data => { if (!cancel) { setAds(data); setLoading(false) } })
      .catch(e => { if (!cancel) { setErr(e.message || 'Erro'); setLoading(false) } })
    return () => { cancel = true }
  }, [accountId, days, since, until])

  const top = [...ads]
    .sort((a, b) => extractValue(b, sortKey) - extractValue(a, sortKey))
    .filter(a => extractValue(a, sortKey) > 0)
    .slice(0, 6)

  return (
    <div className="table-card top-creatives">
      <div className="table-header">
        <h3>Top Criativos</h3>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          6 melhores por {SORT_OPTIONS.find(o => o.key === sortKey)?.label.toLowerCase()}
        </span>
      </div>

      <div className="top-creatives-filter">
        {SORT_OPTIONS.map(opt => {
          const Icon = opt.icon
          const active = sortKey === opt.key
          return (
            <button
              key={opt.key}
              onClick={() => setSortKey(opt.key)}
              className={`filter-chip ${active ? 'active' : ''}`}
            >
              <Icon size={13} />
              {opt.label}
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="top-creatives-state"><Loader2 size={18} className="spin" /> Carregando criativos...</div>
      )}
      {err && (
        <div className="top-creatives-state" style={{ color: 'var(--negative)' }}>Erro: {err}</div>
      )}
      {!loading && !err && top.length === 0 && (
        <div className="top-creatives-state">Nenhum criativo com gasto no periodo.</div>
      )}
      {!loading && !err && top.length > 0 && (
        <div className="creatives-grid">
          {top.map(ad => (
            <CreativeCard key={ad.id} ad={ad} sortKey={sortKey} onPreview={(id, name) => setPreview({ id, name })} />
          ))}
        </div>
      )}

      {preview && (
        <PreviewModal adId={preview.id} adName={preview.name} onClose={() => setPreview(null)} />
      )}
    </div>
  )
}
