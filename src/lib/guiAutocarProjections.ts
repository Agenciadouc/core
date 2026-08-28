// Projecoes fingidas Gui Autocar — fonte unica de verdade pras 3 abas
// (Meta CRM, Google CRM, Geral). Meta e Google tem funis SEPARADOS,
// entao soma bate: Total = Meta + Google.

export const GA_PROJ = {
  ticket: 2984.50,  // ticket medio historico ultimos 90 dias
  // Baseline mensal Meta (60% do total ~R$48k/mes)
  metaLeads30d: 130,
  metaQualRate: 0.32,
  metaMeioRate: 0.18,
  metaCloseRate: 0.39,   // 130 * 0.32 * 0.39 = 16.2 vendas/mes -> R$47.752
  metaCostPerLead: 11.40,
  // Baseline mensal Google (40% do total ~R$33k/mes)
  googleLeads30d: 62,
  googleQualRate: 0.38,
  googleMeioRate: 0.17,
  googleCloseRate: 0.47, // 62 * 0.38 * 0.47 = 11.1 vendas/mes -> R$32.829
  googleCostPerLead: 16.30,
  // Baseline semanal Google Ads (escala com o aumento de leads)
  googleSpendPerWeek: 295.50,
  googleImpressionsPerWeek: 10870,
  googleClicksPerWeek: 167,
  googleConversionsPerWeek: 18,
} as const

export interface GAFunnelSide {
  leads: number
  qualSim: number
  qualMeio: number
  qualNao: number
  vendas: number
  faturamento: number
}

export interface GAProjection {
  ticket: number
  meta: GAFunnelSide
  google: GAFunnelSide
  total: GAFunnelSide
  // Google Ads (aba Google) — metricas de midia
  gads: {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    ctr: number
    cpc: number
    convRate: number
    cpa: number
    revenue: number  // baseado em vendasGoogle x ticket
    roas: number
  }
  // Meta Ads reais nao sao projetados — vem do backend real
}

export function getGuiAutocarProjection(days: number, metaAdSpend?: number): GAProjection {
  const daysScale = Math.max(days, 1) / 30
  const weeks = Math.max(days, 1) / 7

  // ─── Meta side ──────────────────────────────────
  // Leads Meta: max(baseline escalado, adSpend/CPL). Se investir mais que baseline, leads crescem.
  const metaLeadsBaseline = Math.round(GA_PROJ.metaLeads30d * daysScale)
  const metaLeadsFromSpend = metaAdSpend ? Math.round(metaAdSpend / GA_PROJ.metaCostPerLead) : 0
  const mLeads = Math.max(metaLeadsBaseline, metaLeadsFromSpend)
  const mQualSim = Math.round(mLeads * GA_PROJ.metaQualRate)
  const mQualMeio = Math.round(mLeads * GA_PROJ.metaMeioRate)
  const mQualNao = Math.max(0, mLeads - mQualSim - mQualMeio)
  const mVendas = Math.round(mQualSim * GA_PROJ.metaCloseRate)
  const mFat = mVendas * GA_PROJ.ticket

  // ─── Google side ────────────────────────────────
  const gLeads = Math.round(GA_PROJ.googleLeads30d * daysScale)
  const gQualSim = Math.round(gLeads * GA_PROJ.googleQualRate)
  const gQualMeio = Math.round(gLeads * GA_PROJ.googleMeioRate)
  const gQualNao = Math.max(0, gLeads - gQualSim - gQualMeio)
  const gVendas = Math.round(gQualSim * GA_PROJ.googleCloseRate)
  const gFat = gVendas * GA_PROJ.ticket

  // ─── Google Ads midia ───────────────────────────
  const spend = Math.round(GA_PROJ.googleSpendPerWeek * weeks * 100) / 100
  const impressions = Math.round(GA_PROJ.googleImpressionsPerWeek * weeks)
  const clicks = Math.round(GA_PROJ.googleClicksPerWeek * weeks)
  const conversions = Math.round(GA_PROJ.googleConversionsPerWeek * weeks)
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
  const cpc = clicks > 0 ? spend / clicks : 0
  const convRate = clicks > 0 ? (conversions / clicks) * 100 : 0
  const cpa = conversions > 0 ? spend / conversions : 0
  const revenue = gFat  // receita do Google = faturamento das vendas Google
  const roas = spend > 0 ? revenue / spend : 0

  return {
    ticket: GA_PROJ.ticket,
    meta: { leads: mLeads, qualSim: mQualSim, qualMeio: mQualMeio, qualNao: mQualNao, vendas: mVendas, faturamento: mFat },
    google: { leads: gLeads, qualSim: gQualSim, qualMeio: gQualMeio, qualNao: gQualNao, vendas: gVendas, faturamento: gFat },
    total: {
      leads: mLeads + gLeads,
      qualSim: mQualSim + gQualSim,
      qualMeio: mQualMeio + gQualMeio,
      qualNao: mQualNao + gQualNao,
      vendas: mVendas + gVendas,
      faturamento: mFat + gFat,
    },
    gads: { spend, impressions, clicks, conversions, ctr, cpc, convRate, cpa, revenue, roas },
  }
}

export function isGuiAutocar(accountName?: string): boolean {
  const n = (accountName || '').toLowerCase()
  return n.includes('autocar') || n.includes('gui auto')
}
