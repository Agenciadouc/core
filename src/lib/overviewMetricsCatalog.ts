// Catalogo unificado de metricas do Overview.
// Cada metrica sabe como extrair de OverviewData (data agregada de todas as fontes).
// Categorias: unificado / meta / gads / ga4 / instagram / crm / kiwify.

import { formatBRL, formatNumber, formatPercent, type OverviewData } from './api'

export type OverviewCategory = 'unified' | 'meta' | 'gads' | 'ga4' | 'instagram' | 'crm' | 'kiwify'

export interface OverviewMetricDef {
  key: string
  label: string
  category: OverviewCategory
  extract: (data: OverviewData, config?: { metaConversionActions?: string[]; gadsConversionActionIds?: string[] }) => number
  format: (v: number) => string
}

// Helper: extrai action_type especifico dos actions[] do meta insight
function extractMetaActions(data: OverviewData, types: string[]): number {
  if (!data.sources.meta) return 0
  // O overview backend ja retorna algumas actions agregadas em data.sources.meta:
  //   leads, messaging, purchases (mas os totais podem estar em action arrays)
  // Como o backend NAO expoe todos os action_types, aproximamos com o que tem
  let total = 0
  const m = data.sources.meta as any
  if (types.includes('purchase') || types.includes('offsite_conversion.fb_pixel_purchase')) total += (m.purchases || 0)
  if (types.includes('lead') || types.includes('onsite_conversion.lead_grouped')) total += (m.leads || 0)
  if (types.includes('onsite_conversion.messaging_conversation_started_7d')) total += (m.messaging || 0)
  return total
}

function extractGadsConversions(data: OverviewData, _ids: string[]): number {
  // Backend retorna total agregado em s.gads.conversions
  // Se quiser filtro por ID especifico, teria que usar endpoint /conversions e cross-reference — feature futura
  return data.sources.gads?.conversions || 0
}

export const OVERVIEW_METRICS: OverviewMetricDef[] = [
  // UNIFICADO (soma Meta + Google)
  { key: 'unified.spend', label: 'Investimento total', category: 'unified',
    extract: d => (d.sources.meta?.spend || 0) + (d.sources.gads?.spend || 0),
    format: formatBRL,
  },
  { key: 'unified.impressions', label: 'Impressoes total', category: 'unified',
    extract: d => (d.sources.meta?.impressions || 0) + (d.sources.gads?.impressions || 0),
    format: formatNumber,
  },
  { key: 'unified.clicks', label: 'Cliques total', category: 'unified',
    extract: d => (d.sources.meta?.clicks || 0) + (d.sources.gads?.clicks || 0),
    format: formatNumber,
  },
  { key: 'unified.ctr', label: 'CTR unificado', category: 'unified',
    extract: d => {
      const clicks = (d.sources.meta?.clicks || 0) + (d.sources.gads?.clicks || 0)
      const imp = (d.sources.meta?.impressions || 0) + (d.sources.gads?.impressions || 0)
      return imp > 0 ? (clicks / imp) * 100 : 0
    },
    format: formatPercent,
  },
  { key: 'unified.conversions', label: 'Conversoes total', category: 'unified',
    extract: (d, cfg) => extractMetaActions(d, cfg?.metaConversionActions || ['purchase', 'lead', 'onsite_conversion.messaging_conversation_started_7d']) + extractGadsConversions(d, cfg?.gadsConversionActionIds || []),
    format: formatNumber,
  },
  { key: 'unified.cpl', label: 'Custo por conversao', category: 'unified',
    extract: (d, cfg) => {
      const spend = (d.sources.meta?.spend || 0) + (d.sources.gads?.spend || 0)
      const conv = extractMetaActions(d, cfg?.metaConversionActions || []) + extractGadsConversions(d, cfg?.gadsConversionActionIds || [])
      return conv > 0 ? spend / conv : 0
    },
    format: formatBRL,
  },
  { key: 'unified.revenue', label: 'Receita total', category: 'unified',
    extract: d => (d.sources.kiwify?.revenue || 0) + (d.sources.gads?.revenue || 0),
    format: formatBRL,
  },
  { key: 'unified.roas', label: 'ROAS', category: 'unified',
    extract: d => {
      const spend = (d.sources.meta?.spend || 0) + (d.sources.gads?.spend || 0)
      const rev = (d.sources.kiwify?.revenue || 0) + (d.sources.gads?.revenue || 0)
      return spend > 0 ? rev / spend : 0
    },
    format: v => v.toFixed(2) + 'x',
  },

  // META
  { key: 'meta.spend',       label: 'Meta investimento', category: 'meta', extract: d => d.sources.meta?.spend || 0, format: formatBRL },
  { key: 'meta.impressions', label: 'Meta impressoes',   category: 'meta', extract: d => d.sources.meta?.impressions || 0, format: formatNumber },
  { key: 'meta.reach',       label: 'Meta alcance',      category: 'meta', extract: d => d.sources.meta?.reach || 0, format: formatNumber },
  { key: 'meta.clicks',      label: 'Meta cliques (link)', category: 'meta', extract: d => (d.sources.meta as any)?.linkClicks || d.sources.meta?.clicks || 0, format: formatNumber },
  { key: 'meta.messaging',   label: 'Meta conversas',    category: 'meta', extract: d => d.sources.meta?.messaging || 0, format: formatNumber },
  { key: 'meta.leads',       label: 'Meta leads (form)', category: 'meta', extract: d => d.sources.meta?.leads || 0, format: formatNumber },
  { key: 'meta.purchases',   label: 'Meta compras',      category: 'meta', extract: d => d.sources.meta?.purchases || 0, format: formatNumber },
  { key: 'meta.conversions', label: 'Meta conversoes (config)', category: 'meta',
    extract: (d, cfg) => extractMetaActions(d, cfg?.metaConversionActions || []), format: formatNumber },

  // GOOGLE ADS
  { key: 'gads.spend',       label: 'Google investimento', category: 'gads', extract: d => d.sources.gads?.spend || 0, format: formatBRL },
  { key: 'gads.impressions', label: 'Google impressoes',   category: 'gads', extract: d => d.sources.gads?.impressions || 0, format: formatNumber },
  { key: 'gads.clicks',      label: 'Google cliques',      category: 'gads', extract: d => d.sources.gads?.clicks || 0, format: formatNumber },
  { key: 'gads.conversions', label: 'Google conversoes',   category: 'gads', extract: d => d.sources.gads?.conversions || 0, format: formatNumber },
  { key: 'gads.revenue',     label: 'Google receita',      category: 'gads', extract: d => d.sources.gads?.revenue || 0, format: formatBRL },
  { key: 'gads.cpa',         label: 'Google custo/conv.',  category: 'gads',
    extract: d => (d.sources.gads?.conversions || 0) > 0 ? (d.sources.gads!.spend / d.sources.gads!.conversions) : 0,
    format: formatBRL },

  // ANALYTICS GA4
  { key: 'ga4.sessions',       label: 'Site sessoes',      category: 'ga4', extract: d => d.sources.ga4?.sessions || 0, format: formatNumber },
  { key: 'ga4.users',          label: 'Site usuarios',     category: 'ga4', extract: d => d.sources.ga4?.users || 0, format: formatNumber },
  { key: 'ga4.engagement_rate',label: 'Site engajamento',  category: 'ga4', extract: d => d.sources.ga4?.engagementRate || 0, format: v => v.toFixed(1) + '%' },
  { key: 'ga4.bounce_rate',    label: 'Site rejeicao',     category: 'ga4', extract: d => d.sources.ga4?.bounceRate || 0, format: v => v.toFixed(1) + '%' },

  // INSTAGRAM
  { key: 'ig.followers',     label: 'IG seguidores',   category: 'instagram', extract: d => d.sources.instagram?.followers || 0, format: formatNumber },
  { key: 'ig.reach',         label: 'IG alcance',      category: 'instagram', extract: d => d.sources.instagram?.reach || 0, format: formatNumber },
  { key: 'ig.interactions',  label: 'IG interacoes',   category: 'instagram', extract: d => d.sources.instagram?.interactions || 0, format: formatNumber },
  { key: 'ig.engagement',    label: 'IG taxa engaj.',  category: 'instagram',
    extract: d => (d.sources.instagram?.reach || 0) > 0 ? ((d.sources.instagram!.interactions / d.sources.instagram!.reach) * 100) : 0,
    format: v => v.toFixed(2) + '%' },

  // CRM
  { key: 'crm.qual_sim',     label: 'CRM qualificados',    category: 'crm', extract: d => d.sources.crm?.qualSim || 0, format: formatNumber },
  { key: 'crm.qual_nao',     label: 'CRM desqualificados', category: 'crm', extract: d => d.sources.crm?.qualNao || 0, format: formatNumber },
  { key: 'crm.qual_meio',    label: 'CRM sem qualif.',     category: 'crm', extract: d => d.sources.crm?.qualMeio || 0, format: formatNumber },
  { key: 'crm.total',        label: 'CRM total leads',     category: 'crm', extract: d => d.sources.crm?.crmTotal || 0, format: formatNumber },
  { key: 'crm.qual_rate',    label: 'CRM taxa qualif.',    category: 'crm',
    extract: d => (d.sources.crm?.crmTotal || 0) > 0 ? ((d.sources.crm!.qualSim / d.sources.crm!.crmTotal) * 100) : 0,
    format: v => v.toFixed(1) + '%' },

  // KIWIFY
  { key: 'kiwify.sales',     label: 'Kiwify vendas',   category: 'kiwify', extract: d => d.sources.kiwify?.sales || 0, format: formatNumber },
  { key: 'kiwify.revenue',   label: 'Kiwify receita',  category: 'kiwify', extract: d => d.sources.kiwify?.revenue || 0, format: formatBRL },
]

export const OVERVIEW_METRICS_BY_KEY: Record<string, OverviewMetricDef> = Object.fromEntries(OVERVIEW_METRICS.map(m => [m.key, m]))

export const OVERVIEW_CATEGORY_LABELS: Record<OverviewCategory, string> = {
  unified:   'Unificado (Meta + Google)',
  meta:      'Meta Ads',
  gads:      'Google Ads',
  ga4:       'Analytics (site)',
  instagram: 'Instagram',
  crm:       'CRM Dros',
  kiwify:    'Kiwify (vendas)',
}

export const OVERVIEW_CATEGORY_ORDER: OverviewCategory[] = ['unified', 'meta', 'gads', 'ga4', 'instagram', 'crm', 'kiwify']

export function getOverviewMetric(key: string): OverviewMetricDef | null {
  return OVERVIEW_METRICS_BY_KEY[key] || null
}
