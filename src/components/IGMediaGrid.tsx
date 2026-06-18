import { formatNumber, type IGMedia } from '../lib/api'
import { Heart, MessageCircle, Bookmark, Eye, Trophy } from 'lucide-react'

interface Props {
  media: IGMedia[]
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function MediaTypeIcon({ type }: { type: string }) {
  if (type === 'VIDEO') return <span className="ig-media-type">Reel</span>
  if (type === 'CAROUSEL_ALBUM') return <span className="ig-media-type">Carrossel</span>
  return null
}

export default function IGMediaGrid({ media }: Props) {
  // Sort by engagement (likes + comments) descending
  const sorted = [...media].sort((a, b) => {
    const engA = (a.like_count || 0) + (a.comments_count || 0)
    const engB = (b.like_count || 0) + (b.comments_count || 0)
    return engB - engA
  })

  return (
    <div className="ig-media-section">
      <div className="table-header">
        <h3>Publicacoes (por engajamento)</h3>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{media.length} posts</span>
      </div>
      <div className="ig-media-grid">
        {sorted.map((m, i) => {
          const engagement = (m.like_count || 0) + (m.comments_count || 0)
          const isTop = i === 0 && engagement > 0

          return (
            <a
              key={m.id}
              href={m.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className={`ig-media-card ${isTop ? 'top-post' : ''}`}
            >
              <div className="ig-media-thumb">
                {(m.thumbnail_url || m.media_url) ? (
                  <img src={m.thumbnail_url || m.media_url} alt="" />
                ) : (
                  <div className="ig-media-placeholder">📷</div>
                )}
                <MediaTypeIcon type={m.media_type} />
                {isTop && <div className="ig-top-badge"><Trophy size={10} /> Top Post</div>}
              </div>
              <div className="ig-media-stats">
                <div className="ig-media-stat">
                  <Heart size={12} /> {formatNumber(m.like_count || 0)}
                </div>
                <div className="ig-media-stat">
                  <MessageCircle size={12} /> {formatNumber(m.comments_count || 0)}
                </div>
                {m.insights?.reach > 0 && (
                  <div className="ig-media-stat">
                    <Eye size={12} /> {formatNumber(m.insights.reach)}
                  </div>
                )}
              </div>
              <div className="ig-media-date">{formatDate(m.timestamp)}</div>
              {m.caption && (
                <div className="ig-media-caption">{m.caption.slice(0, 60)}{m.caption.length > 60 ? '...' : ''}</div>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
