import { formatNumber, pctChange, type IGInsightsResponse, type IGProfile } from '../lib/api'
import { TrendingUp, TrendingDown, Eye, Users, UserPlus, Globe, Heart, Bookmark, BarChart3, Percent, Share2 } from 'lucide-react'

interface Props {
  insights: IGInsightsResponse
  profile?: IGProfile | null
}

function Metric({ label, value, previousValue, icon, color, suffix, alert }: {
  label: string; value: number | string; previousValue?: number; icon: React.ReactNode; color: string; suffix?: string; alert?: string
}) {
  const numVal = typeof value === 'number' ? value : parseFloat(value) || 0
  const change = previousValue !== undefined ? pctChange(numVal, previousValue) : null
  const isPos = change !== null && change >= 0

  return (
    <div className={`metric-card ${alert ? 'metric-alert' : ''}`}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon" style={{ background: `${color}20`, color }}>{icon}</div>
      </div>
      <div className="metric-value">{typeof value === 'string' ? value : formatNumber(numVal)}{suffix || ''}</div>
      <div className="metric-sub">
        {change !== null && (
          <span className={isPos ? 'positive' : 'negative'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {isPos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {isPos ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>
      {alert && <div className="metric-alert-text">{alert}</div>}
    </div>
  )
}

export default function IGMetrics({ insights, profile }: Props) {
  const c = insights.current.totals
  const p = insights.previous.totals
  const followers = profile?.followers_count || 0
  const reach = c.reach || 0
  const prevReach = p.reach || 0

  const engRate = reach > 0 ? ((c.total_interactions || 0) / reach) * 100 : 0
  const prevEngRate = prevReach > 0 ? ((p.total_interactions || 0) / prevReach) * 100 : 0
  const reachPerFollower = followers > 0 && reach > 0 ? (reach / followers) * 100 : 0
  const prevReachPerFol = followers > 0 && prevReach > 0 ? (prevReach / followers) * 100 : 0
  const saveRate = reach > 0 ? ((c.saves || 0) / reach) * 100 : 0
  const prevSaveRate = prevReach > 0 ? ((p.saves || 0) / prevReach) * 100 : 0
  const shareRate = reach > 0 ? ((c.shares || 0) / reach) * 100 : 0
  const prevShareRate = prevReach > 0 ? ((p.shares || 0) / prevReach) * 100 : 0

  return (
    <div className="metrics-grid">
      <Metric label="Alcance" value={reach} previousValue={prevReach} icon={<Eye size={16} />} color="#FFB300" />
      <Metric label="Visitas ao Perfil" value={c.profile_views || 0} previousValue={p.profile_views || 0} icon={<Globe size={16} />} color="#FFAA83" />
      <Metric label="Contas Engajadas" value={c.accounts_engaged || 0} previousValue={p.accounts_engaged || 0} icon={<Users size={16} />} color="#5DADE2" />
      <Metric label="Interacoes" value={c.total_interactions || 0} previousValue={p.total_interactions || 0} icon={<Heart size={16} />} color="#FF6B8A" />
      <Metric
        label="Taxa de Engajamento"
        value={engRate.toFixed(2) + '%'}
        previousValue={prevEngRate}
        icon={<Percent size={16} />}
        color={engRate >= 3 ? '#34C759' : engRate >= 1 ? '#FFB300' : '#FF6B6B'}
        alert={engRate < 1 && reach > 0 ? 'Engajamento baixo' : engRate >= 5 ? 'Excelente!' : undefined}
      />
      <Metric
        label="Alcance/Seguidor"
        value={reachPerFollower.toFixed(0) + '%'}
        previousValue={prevReachPerFol}
        icon={<BarChart3 size={16} />}
        color="#9B59B6"
      />
      <Metric
        label="Save Rate"
        value={saveRate.toFixed(2) + '%'}
        previousValue={prevSaveRate}
        icon={<Bookmark size={16} />}
        color={saveRate >= 1 ? '#34C759' : saveRate >= 0.3 ? '#FFB300' : '#FF6B6B'}
        alert={saveRate < 0.1 && reach > 0 ? 'Conteudo nao esta sendo salvo' : undefined}
      />
      <Metric
        label="Share Rate"
        value={shareRate.toFixed(2) + '%'}
        previousValue={prevShareRate}
        icon={<Share2 size={16} />}
        color={shareRate >= 0.5 ? '#34C759' : shareRate >= 0.2 ? '#FFB300' : '#FFAA83'}
      />
    </div>
  )
}
