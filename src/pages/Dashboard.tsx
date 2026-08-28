import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  fetchAccounts,
  fetchCompare,
  fetchDailyCompare,
  type MetaAccount,
  type CompareResponse,
  type DailyCompareResponse,
  DAYS_MAP,
} from '../lib/api'
import Sidebar from '../components/Sidebar'
import MetricCards from '../components/MetricCards'
import SpendChart from '../components/SpendChart'
import CampaignTree from '../components/CampaignTree'
import TopCreatives from '../components/TopCreatives'
import FunnelChart from '../components/FunnelChart'
import InstagramView from '../components/InstagramView'
import CRMView from '../components/CRMView'
import KiwifyView from '../components/KiwifyView'
import GoogleAdsView from '../components/GoogleAdsView'
import AnalyticsView from '../components/AnalyticsView'
import OverviewView from '../components/OverviewView'
import { Search, LogOut, BarChart3, Instagram, LineChart, LayoutDashboard, Calendar, ChevronsLeft, ChevronsRight, Settings2, RefreshCw, Share2, Check, Copy, Link as LinkIcon, X, Eye } from 'lucide-react'
import { fetchDashboardConfig, saveDashboardConfig as saveConfigApi, publishDashboard, unpublishDashboard, syncAccountNow, getAccountSyncStatus, refreshHub, clearApiCache, DEFAULT_CONFIG, type DashboardConfig } from '../lib/dashboardConfig'
import MetricPicker from '../components/MetricPicker'

const DATE_OPTIONS = [
  { label: '7 dias', value: '7d' },
  { label: '14 dias', value: '14d' },
  { label: '30 dias', value: '30d' },
  { label: '90 dias', value: '90d' },
  { label: 'Personalizado', value: 'custom' },
]

type ClientTab = 'overview' | 'ads' | 'instagram' | 'googleads' | 'analytics'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [accounts, setAccounts] = useState<MetaAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<MetaAccount | null>(null)
  const [clientTab, setClientTab] = useState<ClientTab>('overview')
  const [datePeriod, setDatePeriod] = useState('7d')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [showCustomDates, setShowCustomDates] = useState(false)
  const [compareData, setCompareData] = useState<CompareResponse | null>(null)
  const [campaignCompare, setCampaignCompare] = useState<CompareResponse | null>(null)
  const [dailyCompare, setDailyCompare] = useState<DailyCompareResponse | null>(null)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Personalizacao (Fase A/B/C/D)
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG)
  const [editing, setEditing] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [publicSlug, setPublicSlug] = useState<string | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  // Embed mode: query params ?account=NOME&embed=1 (usado quando este painel e carregado dentro de um iframe do /hub)
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const embedMode = urlParams.get('embed') === '1'
  const requestedAccount = urlParams.get('account') || ''
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => embedMode ? true : localStorage.getItem('core_sidebar_collapsed') === '1')
  const toggleSidebar = () => setSidebarCollapsed(p => { const v = !p; localStorage.setItem('core_sidebar_collapsed', v ? '1' : '0'); return v })

  useEffect(() => {
    fetchAccounts()
      .then((accs) => {
        setAccounts(accs)
        if (accs.length > 0) {
          // Se veio com ?account=NOME, pre-seleciona o que bate (substring case-insensitive)
          if (requestedAccount) {
            const q = requestedAccount.toLowerCase()
            const match = accs.find(a => (a.name || '').toLowerCase().includes(q))
            setSelectedAccount(match || accs[0])
          } else {
            setSelectedAccount(accs[0])
          }
        }
      })
      .finally(() => setLoadingAccounts(false))
  }, [])

  // Calculate days for custom period
  const getEffectiveDays = (): number => {
    if (datePeriod === 'custom' && customDateFrom && customDateTo) {
      const diff = Math.ceil((new Date(customDateTo).getTime() - new Date(customDateFrom).getTime()) / 86400000) + 1
      return Math.max(diff, 1)
    }
    return DAYS_MAP[datePeriod] || 7
  }

  useEffect(() => {
    if (!selectedAccount || (clientTab !== 'ads' && clientTab !== 'overview')) return
    if (clientTab === 'overview') return
    if (datePeriod === 'custom' && (!customDateFrom || !customDateTo)) return
    setLoadingData(true)
    const days = getEffectiveDays()
    const since = datePeriod === 'custom' ? customDateFrom : undefined
    const until = datePeriod === 'custom' ? customDateTo : undefined

    Promise.all([
      fetchCompare(selectedAccount.id, days, 'account', since, until).catch(() => null),
      fetchCompare(selectedAccount.id, days, 'campaign', since, until).catch(() => null),
      fetchDailyCompare(selectedAccount.id, days, since, until).catch(() => null),
    ])
      .then(([acct, camp, daily]) => {
        setCompareData(acct)
        setCampaignCompare(camp)
        setDailyCompare(daily)
        setLastUpdate(new Date())
      })
      .finally(() => setLoadingData(false))
  }, [selectedAccount, datePeriod, clientTab, customDateFrom, customDateTo])

  // Reset tab when switching accounts
  useEffect(() => {
    setClientTab('overview')
    setEditing(false)
  }, [selectedAccount])

  // Load config quando muda de conta
  useEffect(() => {
    if (!selectedAccount) return
    let cancel = false
    fetchDashboardConfig(selectedAccount.id)
      .then(res => { if (!cancel) { setConfig(res.config); setPublicSlug(res.public_slug) } })
      .catch(() => { if (!cancel) { setConfig(DEFAULT_CONFIG); setPublicSlug(null) } })
    getAccountSyncStatus(selectedAccount.id)
      .then(s => { if (!cancel) setLastSyncAt(s.last_update) })
      .catch(() => {})
    return () => { cancel = true }
  }, [selectedAccount])

  const patchConfig = (patch: Partial<DashboardConfig>) => setConfig(prev => ({ ...prev, ...patch }))

  const handleSaveConfig = async () => {
    if (!selectedAccount) return
    setSavingCfg(true)
    try {
      await saveConfigApi(selectedAccount.id, config)
      setEditing(false)
    } catch (e) { console.error(e); alert('Erro ao salvar personalizacao') }
    setSavingCfg(false)
  }

  const handleSync = async () => {
    if (!selectedAccount) return
    setSyncing(true)
    try {
      // Sync Meta ads + limpa cache HTTP das outras APIs
      await Promise.all([
        syncAccountNow(selectedAccount.id),
        clearApiCache('all'),  // limpa google-ads/instagram/analytics/overview cache
      ])
      const s = await getAccountSyncStatus(selectedAccount.id)
      setLastSyncAt(s.last_update)
      const days = getEffectiveDays()
      const since = datePeriod === 'custom' ? customDateFrom : undefined
      const until = datePeriod === 'custom' ? customDateTo : undefined
      const [acct, camp, daily] = await Promise.all([
        fetchCompare(selectedAccount.id, days, 'account', since, until).catch(() => null),
        fetchCompare(selectedAccount.id, days, 'campaign', since, until).catch(() => null),
        fetchDailyCompare(selectedAccount.id, days, since, until).catch(() => null),
      ])
      setCompareData(acct); setCampaignCompare(camp); setDailyCompare(daily); setLastUpdate(new Date())
    } catch (e) { console.error(e); alert('Erro ao sincronizar') }
    setSyncing(false)
  }

  const handlePublish = async () => {
    if (!selectedAccount) return
    try {
      const slug = await publishDashboard(selectedAccount.id)
      setPublicSlug(slug)
      setShowShareModal(true)
    } catch (e) { alert('Erro ao publicar') }
  }

  const handleUnpublish = async () => {
    if (!selectedAccount) return
    try {
      await unpublishDashboard(selectedAccount.id)
      setPublicSlug(null)
      setShowShareModal(false)
    } catch (e) { alert('Erro ao remover publicacao') }
  }

  const publicUrl = publicSlug ? `${window.location.origin}/core/public/${publicSlug}` : null

  // Helper: formata "coletado ha Xh" a partir do last_update (ISO)
  const formatSyncAgo = (isoOrDatetime: string | null) => {
    if (!isoOrDatetime) return 'nunca'
    const t = new Date(isoOrDatetime.replace(' ', 'T') + 'Z').getTime()
    const diffMin = Math.round((Date.now() - t) / 60000)
    if (diffMin < 60) return `ha ${diffMin} min`
    const diffH = Math.round(diffMin / 60)
    if (diffH < 48) return `ha ${diffH}h`
    const diffD = Math.round(diffH / 24)
    return `ha ${diffD}d`
  }

  const filteredAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  const current = compareData?.current?.[0] || null
  const previous = compareData?.previous?.[0] || null

  return (
    <div className="dashboard">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <img src={`${import.meta.env.BASE_URL}logo-dros.png`} alt="Dros" className="sidebar-logo" />
          {!sidebarCollapsed && <div className="subtitle">Painel de Performance</div>}
        </div>

        {!sidebarCollapsed && (
          <div className="sidebar-search">
            <Search size={14} className="search-icon" />
            <input type="text" placeholder="Buscar conta..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
        <div className="account-list">
          {loadingAccounts ? (
            <div className="loading-container" style={{ minHeight: 200 }}><div className="spinner" /></div>
          ) : (
            filteredAccounts.map((account) => (
              <Sidebar key={account.id} account={account} active={selectedAccount?.id === account.id} onClick={() => setSelectedAccount(account)} />
            ))
          )}
        </div>

        <div className="sidebar-footer">
          {!sidebarCollapsed && <div className="user-name">{user?.name}</div>}
          <button
            className="logout-btn"
            title="Recarregar clientes do Hub"
            onClick={async () => {
              try {
                const r = await refreshHub()
                alert(`Sincronizado com Hub:\n${r.hub_clients} clientes\n${r.with_meta} com Meta\n${r.with_ig} com Instagram\n${r.with_gads} com Google Ads`)
                const accs = await fetchAccounts()
                setAccounts(accs)
                if (!selectedAccount && accs.length > 0) setSelectedAccount(accs[0])
              } catch (e: any) { alert('Erro ao atualizar do Hub: ' + e.message) }
            }}
          ><RefreshCw size={16} /></button>
          <button className="logout-btn" onClick={logout} title="Sair"><LogOut size={16} /></button>
        </div>
        <button className="sidebar-collapse-btn" onClick={toggleSidebar} title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}>
          {sidebarCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </aside>

      <main className="main-content">
        {!selectedAccount ? (
          <div className="empty-state">
            <div className="icon">📊</div>
            <h3>Selecione uma conta</h3>
            <p>Escolha uma conta na barra lateral para ver os dados.</p>
          </div>
        ) : (
          <>
            {/* Header with client name + tabs */}
            <div className="main-header">
              <h2 style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                {selectedAccount.name}
                <span
                  title="Meta Ad Account ID — clique pra copiar"
                  onClick={() => { try { navigator.clipboard.writeText(String(selectedAccount.id).replace(/^act_/, '')) } catch {} }}
                  style={{ fontSize: 11, fontWeight: 400, color: '#7a8194', fontFamily: 'ui-monospace, SFMono-Regular, monospace', padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'copy', userSelect: 'all' }}
                >
                  {String(selectedAccount.id).replace(/^act_/, '')}
                </span>
              </h2>
              <div className="client-tabs">
                <button className={`client-tab ${clientTab === 'overview' ? 'active' : ''}`} onClick={() => setClientTab('overview')}>
                  <LayoutDashboard size={14} /><span>Geral</span>
                </button>
                <button className={`client-tab ${clientTab === 'ads' ? 'active' : ''}`} onClick={() => setClientTab('ads')}>
                  <BarChart3 size={14} /><span>Meta Ads</span>
                </button>
                <button className={`client-tab ${clientTab === 'instagram' ? 'active' : ''}`} onClick={() => setClientTab('instagram')}>
                  <Instagram size={14} /><span>Instagram</span>
                </button>
                <button className={`client-tab ${clientTab === 'googleads' ? 'active' : ''}`} onClick={() => setClientTab('googleads')}>
                  <BarChart3 size={14} /><span>Google Ads</span>
                </button>
                <button className={`client-tab ${clientTab === 'analytics' ? 'active' : ''}`} onClick={() => setClientTab('analytics')}>
                  <LineChart size={14} /><span>Analytics</span>
                </button>
              </div>
            </div>

            {/* Date selector (shown for all tabs) */}
            <div className="date-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <div className="date-selector">
                {DATE_OPTIONS.map((opt) => (
                  <button key={opt.value} className={`date-btn ${datePeriod === opt.value ? 'active' : ''}`} onClick={() => {
                    setDatePeriod(opt.value)
                    if (opt.value === 'custom') setShowCustomDates(true)
                    else setShowCustomDates(false)
                  }}>
                    {opt.value === 'custom' ? <><Calendar size={11} /> {opt.label}</> : opt.label}
                  </button>
                ))}
              </div>
              {showCustomDates && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="date" className="input" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} style={{ width: 140, padding: '6px 10px', fontSize: 12 }} />
                  <span style={{ color: '#6E6887', fontSize: 11 }}>ate</span>
                  <input type="date" className="input" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} style={{ width: 140, padding: '6px 10px', fontSize: 12 }} />
                </div>
              )}
            </div>

            {/* Tab: Overview */}
            {clientTab === 'overview' && (
              <OverviewView accountId={selectedAccount.id} accountName={selectedAccount.name} days={getEffectiveDays()} since={datePeriod === 'custom' ? customDateFrom : undefined} until={datePeriod === 'custom' ? customDateTo : undefined} />
            )}

            {/* Tab: Meta Ads */}
            {clientTab === 'ads' && (
              <>
                {/* Barra de acoes: coletado ha X + botoes Personalizar/Sincronizar/Publicar */}
                <div className="ads-toolbar">
                  <div className="ads-toolbar-meta">
                    <span className="meta-source">Meta Ads</span>
                    <span className="meta-sep">·</span>
                    <span className="meta-collected">coletado {formatSyncAgo(lastSyncAt)}</span>
                  </div>
                  <div className="ads-toolbar-actions">
                    {editing ? (
                      <>
                        <button className="btn-tool btn-tool-primary" onClick={handleSaveConfig} disabled={savingCfg}>
                          <Check size={13} /> {savingCfg ? 'Salvando...' : 'Concluir edicao'}
                        </button>
                        <button className="btn-tool btn-tool-ghost" onClick={() => { setEditing(false); fetchDashboardConfig(selectedAccount.id).then(r => setConfig(r.config)) }}>
                          <X size={13} /> Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-tool" onClick={() => setEditing(true)}>
                          <Settings2 size={13} /> Personalizar
                        </button>
                        <button className="btn-tool" onClick={handleSync} disabled={syncing}>
                          <RefreshCw size={13} className={syncing ? 'spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sincronizar'}
                        </button>
                        <button className="btn-tool" onClick={() => publicSlug ? setShowShareModal(true) : handlePublish()}>
                          {publicSlug ? <><LinkIcon size={13} /> Link publico</> : <><Share2 size={13} /> Publicar</>}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {loadingData ? (
                  <div className="loading-container"><div className="spinner" /><span>Carregando dados...</span></div>
                ) : !current ? (
                  <div className="empty-state">
                    <div className="icon">📭</div>
                    <h3>Sem dados no periodo</h3>
                    <p>Nenhum dado encontrado para os ultimos {getEffectiveDays()} dias. Talvez precise clicar em <b>Sincronizar</b>.</p>
                  </div>
                ) : (
                  <>
                    {/* CARDS DE METRICAS */}
                    <section className={`dash-section ${editing ? 'is-editing' : ''}`}>
                      {editing && (
                        <div className="section-editor-bar">
                          <span className="section-chip">Cartoes de metricas</span>
                          <MetricPicker label="Metricas dos cartoes" selected={config.cards} onChange={v => patchConfig({ cards: v })} />
                        </div>
                      )}
                      <MetricCards current={current} previous={previous} cards={config.cards} />
                    </section>

                    {/* CONFIG CONVERSOES META (modo edicao apenas) */}
                    {editing && current?.actions && current.actions.length > 0 && (
                      <section className="dash-section is-editing">
                        <div className="section-editor-bar">
                          <span className="section-chip">Conversoes Meta desse cliente</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>marque os eventos que contam como "conversao" no Overview</span>
                        </div>
                        <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {[...new Set(current.actions.map((a: any) => a.action_type))].sort().map((action_type: string) => {
                            const value = current.actions.find((a: any) => a.action_type === action_type)?.value
                            const isSelected = (config.metaConversionActions || []).includes(action_type)
                            return (
                              <button
                                key={action_type}
                                onClick={() => {
                                  const cur = config.metaConversionActions || []
                                  patchConfig({ metaConversionActions: isSelected ? cur.filter(a => a !== action_type) : [...cur, action_type] })
                                }}
                                style={{
                                  padding: '6px 12px', borderRadius: 6,
                                  background: isSelected ? 'rgba(52,199,89,0.15)' : 'var(--bg-card)',
                                  color: isSelected ? '#34C759' : 'var(--text-secondary)',
                                  border: `1px solid ${isSelected ? 'rgba(52,199,89,0.35)' : 'var(--border-subtle)'}`,
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                  fontFamily: 'ui-monospace, monospace',
                                }}
                              >
                                {isSelected ? '✓ ' : ''}{action_type} <span style={{ opacity: 0.6 }}>({value})</span>
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    )}

                    {/* GRAFICO DIARIO + FUNIL — lado a lado */}
                    <section className={`dash-section ${editing ? 'is-editing' : ''}`}>
                      {editing && (
                        <div className="section-editor-bar">
                          <span className="section-chip">Grafico + Funil</span>
                          <MetricPicker label="Metricas do grafico" selected={config.chartAvailableMetrics} onChange={v => patchConfig({ chartAvailableMetrics: v })} />
                          <MetricPicker label={`Grafico default: ${config.chartDefaultMetric}`} selected={[config.chartDefaultMetric]} onChange={v => patchConfig({ chartDefaultMetric: v[0] || 'spend' })} singleSelect allowedKeys={config.chartAvailableMetrics} />
                          <MetricPicker label="Etapas do funil" selected={config.funnel} onChange={v => patchConfig({ funnel: v })} />
                        </div>
                      )}
                      <div className="perf-grid">
                        {!(selectedAccount?.name || '').toLowerCase().match(/autocar|gui auto/) && (
                          <div className="chart-card">
                            <SpendChart
                              currentData={dailyCompare?.current || []}
                              previousData={dailyCompare?.previous || []}
                              defaultMetric={config.chartDefaultMetric}
                              availableMetrics={config.chartAvailableMetrics}
                            />
                          </div>
                        )}
                        <div className="chart-card">
                          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, letterSpacing: '.02em' }}>Funil</h3>
                          <FunnelChart insight={current} steps={config.funnel} />
                        </div>
                      </div>
                    </section>

                    {/* CAMPANHAS */}
                    <section className={`dash-section ${editing ? 'is-editing' : ''}`}>
                      {editing && (
                        <div className="section-editor-bar">
                          <span className="section-chip">Campanhas e anuncios</span>
                          <MetricPicker label="Colunas" selected={config.table} onChange={v => patchConfig({ table: v })} />
                        </div>
                      )}
                      <div className="table-card">
                        <div className="table-header"><h3>Campanhas</h3><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Clique numa campanha pra ver conjuntos + anuncios</span></div>
                        <CampaignTree
                          currentCampaigns={campaignCompare?.current || []}
                          previousCampaigns={campaignCompare?.previous || []}
                          days={getEffectiveDays()}
                          since={showCustomDates && customDateFrom ? customDateFrom : undefined}
                          until={showCustomDates && customDateTo ? customDateTo : undefined}
                          columns={config.table}
                          accountId={selectedAccount.id}
                        />
                      </div>
                    </section>

                    {/* TOP CRIATIVOS */}
                    <section className={`dash-section ${editing ? 'is-editing' : ''}`}>
                      {editing && (
                        <div className="section-editor-bar">
                          <span className="section-chip">Top criativos</span>
                          <MetricPicker label={`Sort default: ${config.topCreativesSort}`} selected={[config.topCreativesSort]} onChange={v => patchConfig({ topCreativesSort: v[0] || 'spend' })} singleSelect />
                        </div>
                      )}
                      <div className="table-card">
                        <div className="table-header"><h3>Top Criativos</h3><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>6 melhores do periodo</span></div>
                        <TopCreatives
                          accountId={selectedAccount.id}
                          days={getEffectiveDays()}
                          since={showCustomDates && customDateFrom ? customDateFrom : undefined}
                          until={showCustomDates && customDateTo ? customDateTo : undefined}
                          defaultSort={config.topCreativesSort}
                        />
                      </div>
                    </section>

                    <CRMView accountId={selectedAccount.id} accountName={selectedAccount.name} days={getEffectiveDays()} adSpend={current ? parseFloat(current.spend) : undefined} />
                    <KiwifyView accountName={selectedAccount.name} days={getEffectiveDays()} adSpend={current ? parseFloat(current.spend) : undefined} />
                  </>
                )}
              </>
            )}

            {/* Modal de compartilhamento (link publico) */}
            {showShareModal && (
              <div className="share-modal-overlay" onClick={() => setShowShareModal(false)}>
                <div className="share-modal" onClick={e => e.stopPropagation()}>
                  <div className="share-modal-header">
                    <h3><LinkIcon size={16} /> Link publico do dashboard</h3>
                    <button className="btn-close" onClick={() => setShowShareModal(false)}><X size={16} /></button>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                    Compartilhe este link com o cliente. Ele ve o dashboard sem precisar de login,
                    com todas as personalizacoes que voce salvou.
                  </p>
                  {publicUrl && (
                    <div className="share-link-box">
                      <code>{publicUrl}</code>
                      <button className="btn-tool" onClick={() => { navigator.clipboard.writeText(publicUrl); alert('Link copiado!') }}>
                        <Copy size={13} /> Copiar
                      </button>
                      <a className="btn-tool" href={publicUrl} target="_blank" rel="noreferrer"><Eye size={13} /> Abrir</a>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn-tool btn-tool-ghost" onClick={handleUnpublish}>Despublicar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Instagram */}
            {clientTab === 'instagram' && (
              <InstagramView accountName={selectedAccount.name} />
            )}

            {/* Tab: Google Ads */}
            {clientTab === 'googleads' && (
              <GoogleAdsView accountName={selectedAccount.name} days={getEffectiveDays()} since={datePeriod === 'custom' ? customDateFrom : undefined} until={datePeriod === 'custom' ? customDateTo : undefined} />
            )}

            {/* Tab: Analytics */}
            {clientTab === 'analytics' && (
              <AnalyticsView accountName={selectedAccount.name} days={getEffectiveDays()} since={datePeriod === 'custom' ? customDateFrom : undefined} until={datePeriod === 'custom' ? customDateTo : undefined} />
            )}

            {/* Footer */}
            <div className="dashboard-footer">
              <img src={`${import.meta.env.BASE_URL}logo-dros.png`} alt="Dros" style={{ height: 28 }} />
              <span className="footer-update">
                Ultima atualizacao: {lastUpdate?.toLocaleString('pt-BR') || '-'}
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
