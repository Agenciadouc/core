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
import CampaignTable from '../components/CampaignTable'
import FunnelChart from '../components/FunnelChart'
import InstagramView from '../components/InstagramView'
import CRMView from '../components/CRMView'
import KiwifyView from '../components/KiwifyView'
import GoogleAdsView from '../components/GoogleAdsView'
import AnalyticsView from '../components/AnalyticsView'
import OverviewView from '../components/OverviewView'
import { Search, LogOut, BarChart3, Instagram, LineChart, LayoutDashboard, Calendar, ChevronsLeft, ChevronsRight } from 'lucide-react'

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
  }, [selectedAccount])

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
              <h2>{selectedAccount.name}</h2>
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
                {loadingData ? (
                  <div className="loading-container"><div className="spinner" /><span>Carregando dados...</span></div>
                ) : !current ? (
                  <div className="empty-state">
                    <div className="icon">📭</div>
                    <h3>Sem dados no periodo</h3>
                    <p>Nenhum dado encontrado para os ultimos {getEffectiveDays()} dias.</p>
                  </div>
                ) : (
                  <>
                    <section className="dash-section">
                      <MetricCards current={current} previous={previous} />
                    </section>

                    <section className="dash-section">
                      <div className="section-title">Desempenho no Periodo</div>
                      <div className="charts-grid">
                        <div className="chart-card">
                          {selectedAccount.name.toLowerCase().includes('sameco') ? (
                            <>
                              <h3>Leads</h3>
                              <SpendChart currentData={dailyCompare?.current || []} previousData={dailyCompare?.previous || []} dataKey="leads" label="Leads" />
                            </>
                          ) : (
                            <>
                              <h3>Conversas Iniciadas</h3>
                              <SpendChart currentData={dailyCompare?.current || []} previousData={dailyCompare?.previous || []} dataKey="messaging" label="Conversas" />
                            </>
                          )}
                        </div>
                        <div className="chart-card">
                          <h3>Funil de Conversao</h3>
                          <FunnelChart insight={current} />
                        </div>
                      </div>
                      <div className="charts-grid">
                        <div className="chart-card full-width">
                          <h3>Valor Investido</h3>
                          <SpendChart currentData={dailyCompare?.current || []} previousData={dailyCompare?.previous || []} dataKey="spend" label="Investimento" />
                        </div>
                      </div>
                    </section>

                    <section className="dash-section">
                      <div className="section-title">Campanhas</div>
                      <CampaignTable currentCampaigns={campaignCompare?.current || []} previousCampaigns={campaignCompare?.previous || []} />
                    </section>

                    <CRMView accountId={selectedAccount.id} accountName={selectedAccount.name} days={getEffectiveDays()} adSpend={current ? parseFloat(current.spend) : undefined} />

                    <KiwifyView accountName={selectedAccount.name} days={getEffectiveDays()} adSpend={current ? parseFloat(current.spend) : undefined} />
                  </>
                )}
              </>
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
