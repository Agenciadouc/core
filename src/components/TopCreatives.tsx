// Top criativos: grid 3x2 (2x3 tablet, 1x6 mobile) com filtro por metrica.
// Sortavel dinamicamente pelas metricas do catalogo.

import { useState, useEffect } from 'react'
import { Loader2, Eye } from 'lucide-react'
import { fetchTopAds, fetchAdPreview, type MetaTopAd, type AdPreviewFormat } from '../lib/api'
import { METRICS, CATEGORY_LABELS, CATEGORY_ORDER, getMetric } from '../lib/metricsCatalog'

interface Props {
  accountId: string
  days: number
  since?: string
  until?: string
  defaultSort?: string        // metric-key inicial
  publicSlug?: string         // se setado, usa endpoint publico
}

// ---------- Preview Modal ----------
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

// ---------- Card ----------
function CreativeCard({ ad, sortKey, onPreview }: { ad: MetaTopAd; sortKey: string; onPreview: (id: string, name: string) => void }) {
  const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url
  const isActive = ad.effective_status === 'ACTIVE'

  // Sempre mostra: spend + metrica de sort. Depois adiciona 2 outras que tenham valor > 0.
  const priorityMetrics = ['spend', sortKey, 'ctr', 'link_clicks', 'purchases', 'messaging', 'leads', 'impressions']
  const shown = new Set<string>()
  const metricsToShow: string[] = []
  for (const k of priorityMetrics) {
    if (shown.has(k)) continue
    const def = getMetric(k); if (!def) continue
    const v = def.extract(ad.insight)
    if (k === 'spend' || k === sortKey || v > 0) {
      metricsToShow.push(k); shown.add(k)
      if (metricsToShow.length >= 4) break
    }
  }

  return (
    <div className="creative-card">
      <button className="creative-thumb" onClick={() => onPreview(ad.id, ad.name || 'Ad')}>
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="creative-thumb-empty">?</div>}
        <div className="creative-thumb-overlay"><Eye size={18} /><span>Preview</span></div>
      </button>
      <div className="creative-body">
        <div className="creative-title" title={ad.name}>{ad.name || '(sem nome)'}</div>
        <div className="creative-status"><span className={`status-dot ${isActive ? 'on' : 'off'}`} />{ad.effective_status || '-'}</div>
        <div className="creative-metrics">
          {metricsToShow.map(key => {
            const def = getMetric(key); if (!def) return null
            return (
              <div key={key} className={`metric ${sortKey === key ? 'is-active' : ''}`}>
                <div className="metric-label">{def.label}</div>
                <div className="metric-value">{def.format(def.extract(ad.insight))}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------- Main ----------
export default function TopCreatives({ accountId, days, since, until, defaultSort = 'spend' }: Props) {
  const [ads, setAds] = useState<MetaTopAd[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string>(defaultSort)
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => { setSortKey(defaultSort) }, [defaultSort])

  useEffect(() => {
    let cancel = false
    setLoading(true); setErr(null)
    fetchTopAds(accountId, days, since, until)
      .then(data => { if (!cancel) { setAds(data); setLoading(false) } })
      .catch(e => { if (!cancel) { setErr(e.message); setLoading(false) } })
    return () => { cancel = true }
  }, [accountId, days, since, until])

  const sortDef = getMetric(sortKey)
  const top = [...ads]
    .sort((a, b) => (sortDef?.extract(b.insight) || 0) - (sortDef?.extract(a.insight) || 0))
    .filter(a => sortDef ? sortDef.extract(a.insight) > 0 : true)
    .slice(0, 6)

  // Filtro chips categorizado
  const availableSorts = METRICS.filter(m => !m.isAverage || m.key === 'ctr' || m.key === 'roas')

  return (
    <div className="top-creatives">
      <div className="top-creatives-filter">
        {CATEGORY_ORDER.map(cat => {
          const ms = availableSorts.filter(m => m.category === cat)
          if (!ms.length) return null
          return (
            <div key={cat} className="filter-group">
              <div className="filter-group-label">{CATEGORY_LABELS[cat]}</div>
              <div className="filter-group-chips">
                {ms.map(m => (
                  <button key={m.key} onClick={() => setSortKey(m.key)} className={`filter-chip ${sortKey === m.key ? 'active' : ''}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {loading && <div className="top-creatives-state"><Loader2 size={18} className="spin" /> Carregando criativos...</div>}
      {err && <div className="top-creatives-state" style={{ color: 'var(--negative)' }}>Erro: {err}</div>}
      {!loading && !err && top.length === 0 && <div className="top-creatives-state">Nenhum criativo com {sortDef?.label.toLowerCase() || 'valor'} no periodo.</div>}
      {!loading && !err && top.length > 0 && (
        <div className="creatives-grid">
          {top.map(ad => <CreativeCard key={ad.id} ad={ad} sortKey={sortKey} onPreview={(id, name) => setPreview({ id, name })} />)}
        </div>
      )}

      {preview && <PreviewModal adId={preview.id} adName={preview.name} onClose={() => setPreview(null)} />}
    </div>
  )
}
