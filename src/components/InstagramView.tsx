import { useState, useEffect } from 'react'
import {
  fetchIGAccounts,
  fetchIGProfile,
  fetchIGInsights,
  fetchIGMedia,
  formatNumber,
  pctChange,
  type IGAccount,
  type IGProfile,
  type IGInsightsResponse,
  type IGMedia,
  DAYS_MAP,
} from '../lib/api'
import IGMetrics from './IGMetrics'
import IGChart from './IGChart'
import IGMediaGrid from './IGMediaGrid'
import { TrendingUp, TrendingDown, AlertTriangle, Award, ThumbsDown, Zap, Calendar } from 'lucide-react'

const DATE_OPTIONS = [
  { label: '7 dias', value: '7d' },
  { label: '14 dias', value: '14d' },
  { label: '30 dias', value: '30d' },
]

// Health Score calculation
function calcHealthScore(insights: IGInsightsResponse, profile: IGProfile | null, media: IGMedia[]): { score: string; color: string; label: string; details: string[] } {
  const c = insights.current.totals
  const reach = c.reach || 0
  const eng = c.total_interactions || 0
  const saves = c.saves || 0
  const shares = c.shares || 0
  const followers = profile?.followers_count || 1

  const engRate = reach > 0 ? (eng / reach) * 100 : 0
  const saveRate = reach > 0 ? (saves / reach) * 100 : 0
  const shareRate = reach > 0 ? (shares / reach) * 100 : 0

  // Posting frequency (posts in last 12 fetched)
  const recentPosts = media.length
  const hasReels = media.some(m => m.media_type === 'VIDEO')

  let points = 0
  const details: string[] = []

  // Eng rate (40 points max)
  if (engRate >= 5) { points += 40; details.push('Engajamento excelente') }
  else if (engRate >= 3) { points += 30; details.push('Engajamento bom') }
  else if (engRate >= 1) { points += 15; details.push('Engajamento medio') }
  else { points += 5; details.push('Engajamento baixo - precisa melhorar conteudo') }

  // Save rate (20 points max)
  if (saveRate >= 1) { points += 20; details.push('Conteudo de alto valor (saves)') }
  else if (saveRate >= 0.3) points += 10
  else { details.push('Saves baixo - criar conteudo mais util/educativo') }

  // Share rate (20 points max)
  if (shareRate >= 1) { points += 20; details.push('Conteudo viral (shares)') }
  else if (shareRate >= 0.3) points += 10
  else { details.push('Shares baixo - criar conteudo mais compartilhavel') }

  // Posting (20 points max)
  if (recentPosts >= 8) { points += 15 }
  else if (recentPosts >= 4) { points += 10; details.push('Frequencia de posts pode aumentar') }
  else { points += 5; details.push('Frequencia de posts muito baixa') }

  if (hasReels) { points += 5 }
  else { details.push('Sem Reels - formato com maior alcance') }

  if (points >= 75) return { score: 'A', color: '#34C759', label: 'Excelente', details }
  if (points >= 55) return { score: 'B', color: '#FFB300', label: 'Bom', details }
  if (points >= 35) return { score: 'C', color: '#FFAA83', label: 'Regular', details }
  return { score: 'D', color: '#FF6B6B', label: 'Precisa atencao', details }
}

interface Props {
  accountName?: string
}

export default function InstagramView({ accountName }: Props) {
  const [accounts, setAccounts] = useState<IGAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<IGAccount | null>(null)
  const [profile, setProfile] = useState<IGProfile | null>(null)
  const [insights, setInsights] = useState<IGInsightsResponse | null>(null)
  const [media, setMedia] = useState<IGMedia[]>([])
  const [datePeriod, setDatePeriod] = useState('7d')
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    fetchIGAccounts()
      .then((accs) => {
        setAccounts(accs)
        if (accountName) {
          // Extract meaningful words from ad account name to match against IG accounts
          // e.g., "00 - Invista Venda" -> check if IG pageName/username contains "invista"
          // e.g., "CA - Fernando Correa" -> check for "fernando"
          const lower = accountName.toLowerCase()
          // Remove common prefixes like "CA -", "CA-", "00 -", digits
          const cleaned = lower.replace(/^(ca\s*-?\s*|[\d]+\s*-\s*)/i, '').trim()
          // Extract key words (at least 3 chars)
          const words = cleaned.split(/[\s\-]+/).filter(w => w.length >= 3)

          const match = accs.find(a => {
            const pageLower = (a.pageName || '').toLowerCase()
            const userLower = (a.username || '').toLowerCase()
            const nameLower = (a.name || '').toLowerCase()
            // Check if any significant word from ad account name appears in IG account
            return words.some(w =>
              pageLower.includes(w) || userLower.includes(w) || nameLower.includes(w)
            )
          })
          // Only set matched accounts — if no match, show empty state
          if (match) {
            // Filter accounts to only those matching the same client
            const filtered = accs.filter(a => {
              const pageLower = (a.pageName || '').toLowerCase()
              const userLower = (a.username || '').toLowerCase()
              const nameLower = (a.name || '').toLowerCase()
              return words.some(w =>
                pageLower.includes(w) || userLower.includes(w) || nameLower.includes(w)
              )
            })
            setAccounts(filtered)
            setSelectedAccount(match)
          } else {
            setAccounts([])
            setSelectedAccount(null)
          }
        } else if (accs.length > 0) {
          setSelectedAccount(accs[0])
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false))
  }, [accountName])

  useEffect(() => {
    if (!selectedAccount) return
    setLoadingData(true)
    const days = DAYS_MAP[datePeriod]
    Promise.all([
      fetchIGProfile(selectedAccount.id).catch(() => null),
      fetchIGInsights(selectedAccount.id, days).catch(() => null),
      fetchIGMedia(selectedAccount.id, 50).catch(() => []),
    ])
      .then(([prof, ins, med]) => { setProfile(prof); setInsights(ins); setMedia(med as IGMedia[]) })
      .finally(() => setLoadingData(false))
  }, [selectedAccount, datePeriod])

  if (loadingAccounts) return <div className="loading-container"><div className="spinner" /><span>Carregando contas Instagram...</span></div>
  if (accounts.length === 0) return <div className="empty-state"><div className="icon">📷</div><h3>Sem dados Instagram</h3><p>Nenhuma conta Instagram vinculada para este cliente.</p></div>

  // Computed values
  const c = insights?.current?.totals || {}
  const p = insights?.previous?.totals || {}
  const reach = c.reach || 0
  const engRate = reach > 0 ? ((c.total_interactions || 0) / reach) * 100 : 0
  const saveRate = reach > 0 ? ((c.saves || 0) / reach) * 100 : 0
  const shareRate = reach > 0 ? ((c.shares || 0) / reach) * 100 : 0
  const prevReach = p.reach || 0
  const prevEngRate = prevReach > 0 ? ((p.total_interactions || 0) / prevReach) * 100 : 0

  const health = insights && profile ? calcHealthScore(insights, profile, media) : null

  // Posting frequency
  const days = DAYS_MAP[datePeriod]
  const postsInPeriod = media.filter(m => {
    const postDate = new Date(m.timestamp)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    return postDate >= cutoff
  }).length
  const postsPerWeek = days > 0 ? ((postsInPeriod / days) * 7).toFixed(1) : '0'

  // Format analysis
  const formats: Record<string, { count: number; likes: number; comments: number }> = {}
  media.forEach(m => {
    const type = m.media_type === 'VIDEO' ? 'Reels' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Imagem'
    if (!formats[type]) formats[type] = { count: 0, likes: 0, comments: 0 }
    formats[type].count++
    formats[type].likes += m.like_count || 0
    formats[type].comments += m.comments_count || 0
  })
  const bestFormat = Object.entries(formats).sort((a, b) => {
    const avgA = (a[1].likes + a[1].comments) / (a[1].count || 1)
    const avgB = (b[1].likes + b[1].comments) / (b[1].count || 1)
    return avgB - avgA
  })[0]

  // Top and worst posts
  const sortedByEng = [...media].sort((a, b) => ((b.like_count || 0) + (b.comments_count || 0)) - ((a.like_count || 0) + (a.comments_count || 0)))
  const topPost = sortedByEng[0]
  const worstPost = sortedByEng.length > 2 ? sortedByEng[sortedByEng.length - 1] : null

  // (alerts removed)

  // Follower growth
  const followerDaily = insights?.current?.daily?.follower_count || []
  const totalNewFollowers = followerDaily.reduce((s, d) => s + d.value, 0)

  return (
    <div className="ig-view">
      {/* Account pills */}
      <div className="ig-accounts-bar">
        {accounts.map((acc) => (
          <button key={acc.id} className={`ig-account-pill ${selectedAccount?.id === acc.id ? 'active' : ''}`} onClick={() => setSelectedAccount(acc)}>
            {acc.profile_picture_url && <img src={acc.profile_picture_url} alt="" className="ig-pill-avatar" />}
            <span>{acc.username || acc.name}</span>
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="ig-header">
        {profile && (
          <div className="ig-profile-summary">
            {profile.profile_picture_url && <img src={profile.profile_picture_url} alt="" className="ig-profile-pic" />}
            <div>
              <h2>@{profile.username}</h2>
              {profile.biography && <p className="ig-bio">{profile.biography}</p>}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="date-selector">
            {DATE_OPTIONS.map((opt) => (
              <button key={opt.value} className={`date-btn ${datePeriod === opt.value ? 'active' : ''}`} onClick={() => setDatePeriod(opt.value)}>{opt.label}</button>
            ))}
          </div>
        </div>
      </div>

      {loadingData ? (
        <div className="loading-container"><div className="spinner" /><span>Carregando dados...</span></div>
      ) : (
        <>
          {/* Profile stats + frequency */}
          {profile && (
            <section className="dash-section">
              <div className="ig-stats-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                <div className="ig-stat-card">
                  <div className="ig-stat-value">{formatNumber(profile.followers_count)}</div>
                  <div className="ig-stat-label">Seguidores</div>
                </div>
                <div className="ig-stat-card">
                  <div className="ig-stat-value">{formatNumber(profile.media_count)}</div>
                  <div className="ig-stat-label">Publicacoes</div>
                </div>
                <div className="ig-stat-card">
                  <div className="ig-stat-value">{postsPerWeek}</div>
                  <div className="ig-stat-label">Posts/Semana</div>
                </div>
                <div className="ig-stat-card">
                  <div className="ig-stat-value" style={{ color: totalNewFollowers >= 0 ? '#34C759' : '#FF6B6B' }}>
                    {totalNewFollowers >= 0 ? '+' : ''}{formatNumber(totalNewFollowers)}
                  </div>
                  <div className="ig-stat-label">Novos Seg. ({days}d)</div>
                </div>
                <div className="ig-stat-card">
                  <div className="ig-stat-value">{postsInPeriod}</div>
                  <div className="ig-stat-label">Posts ({days}d)</div>
                </div>
              </div>
            </section>
          )}

          {/* Metrics with Save Rate + Share Rate */}
          {insights && (
            <section className="dash-section">
              <div className="section-title">Metricas do Periodo</div>
              <IGMetrics insights={insights} profile={profile} />
            </section>
          )}

          {/* Charts */}
          {insights && (
            <section className="dash-section">
              <div className="section-title">Desempenho Diario</div>
              <div className="charts-grid">
                <div className="chart-card">
                  <h3>Alcance Diario</h3>
                  <IGChart currentDaily={insights.current.daily.reach || []} previousDaily={insights.previous.daily.reach || []} label="Alcance" color="#FFB300" />
                </div>
                <div className="chart-card">
                  <h3>Novos Seguidores por Dia</h3>
                  <IGChart currentDaily={insights.current.daily.follower_count || []} previousDaily={insights.previous.daily.follower_count || []} label="Seguidores" color="#34C759" type="bar" />
                </div>
              </div>
            </section>
          )}

          {/* Format Analysis + Recommendation */}
          {media.length > 0 && (
            <section className="dash-section">
              <div className="section-title">Performance por Formato</div>
              <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                {Object.entries(formats).sort((a, b) => {
                  const avgA = (a[1].likes + a[1].comments) / (a[1].count || 1)
                  const avgB = (b[1].likes + b[1].comments) / (b[1].count || 1)
                  return avgB - avgA
                }).map(([type, data], i) => {
                  const avgEng = data.count > 0 ? ((data.likes + data.comments) / data.count).toFixed(0) : '0'
                  const color = type === 'Reels' ? '#FFB300' : type === 'Carrossel' ? '#FFAA83' : '#5DADE2'
                  const isBest = i === 0
                  return (
                    <div key={type} className={`metric-card ${isBest ? '' : ''}`} style={isBest ? { borderColor: `${color}50` } : {}}>
                      <div className="metric-header">
                        <span className="metric-label">{type} {isBest && <Zap size={10} style={{ color }} />}</span>
                        <div className="metric-icon" style={{ background: `${color}20`, color, fontSize: 11, fontWeight: 700 }}>{data.count}</div>
                      </div>
                      <div className="metric-value">{avgEng}</div>
                      <div className="metric-sub">eng. medio/post {isBest && '(melhor formato)'}</div>
                    </div>
                  )
                })}
              </div>
              {bestFormat && (
                <div style={{ marginTop: 10, padding: '8px 14px', borderRadius: 8, background: 'rgba(255,179,0,0.08)', border: '1px solid rgba(255,179,0,0.2)', fontSize: 12, color: '#FFB300', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={13} /> <strong>{bestFormat[0]}</strong> gera {bestFormat[1].count > 0 ? ((bestFormat[1].likes + bestFormat[1].comments) / bestFormat[1].count).toFixed(0) : '0'} eng/post — {bestFormat[0] === 'Reels' ? 'continue investindo nesse formato' : 'considere aumentar a frequencia de Reels para mais alcance'}
                </div>
              )}
            </section>
          )}

          {/* Top & Worst Posts */}
          {topPost && (
            <section className="dash-section">
              <div className="section-title">Destaques</div>
              <div className="charts-grid">
                <div className="chart-card" style={{ borderColor: 'rgba(52,199,89,0.3)' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Award size={14} style={{ color: '#34C759' }} /> Melhor Post</h3>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {(topPost.thumbnail_url || topPost.media_url) && (
                      <img src={topPost.thumbnail_url || topPost.media_url} alt="" style={{ width: 100, height: 100, borderRadius: 8, objectFit: 'cover' }} />
                    )}
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#34C759' }}>
                        {(topPost.like_count || 0) + (topPost.comments_count || 0)} eng
                      </div>
                      <div style={{ fontSize: 11, color: '#9B96B0', marginTop: 2 }}>
                        {topPost.like_count} likes · {topPost.comments_count} comments
                      </div>
                      <div style={{ fontSize: 10, color: '#6B6580', marginTop: 4 }}>
                        {topPost.media_type === 'VIDEO' ? 'Reel' : topPost.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Imagem'} · {new Date(topPost.timestamp).toLocaleDateString('pt-BR')}
                      </div>
                      {topPost.caption && <div style={{ fontSize: 11, color: '#9B96B0', marginTop: 6, lineHeight: 1.3 }}>{topPost.caption.slice(0, 100)}...</div>}
                    </div>
                  </div>
                </div>
                {worstPost && (
                  <div className="chart-card" style={{ borderColor: 'rgba(255,107,107,0.2)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ThumbsDown size={14} style={{ color: '#FF6B6B' }} /> Post com Menor Engajamento</h3>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      {(worstPost.thumbnail_url || worstPost.media_url) && (
                        <img src={worstPost.thumbnail_url || worstPost.media_url} alt="" style={{ width: 100, height: 100, borderRadius: 8, objectFit: 'cover' }} />
                      )}
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#FF6B6B' }}>
                          {(worstPost.like_count || 0) + (worstPost.comments_count || 0)} eng
                        </div>
                        <div style={{ fontSize: 11, color: '#9B96B0', marginTop: 2 }}>
                          {worstPost.like_count} likes · {worstPost.comments_count} comments
                        </div>
                        <div style={{ fontSize: 10, color: '#6B6580', marginTop: 4 }}>
                          {worstPost.media_type === 'VIDEO' ? 'Reel' : worstPost.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Imagem'} · {new Date(worstPost.timestamp).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Media grid */}
          {media.length > 0 && (
            <section className="dash-section">
              <div className="section-title">Todas as Publicacoes por Engajamento</div>
              <IGMediaGrid media={media} />
            </section>
          )}

        </>
      )}
    </div>
  )
}
