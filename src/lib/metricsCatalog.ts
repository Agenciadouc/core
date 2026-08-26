// Catalogo unificado de metricas Meta Ads usado em todos os pickers
// (cards, funil, grafico, colunas tabela). Cada metrica sabe como se extrair
// de um MetaInsight e como se formatar.

import { type MetaInsight, getAction, formatBRL, formatNumber, formatPercent } from './api'

export interface MetricDef {
  key: string
  label: string
  category: 'basico' | 'trafego' | 'mensagens' | 'vendas' | 'engajamento'
  extract: (i: MetaInsight | null | undefined) => number
  format: (v: number) => string
  // Se a metrica for uma proporcao/media (nao soma direto), avisa (usar cuidado em somar em cards)
  isAverage?: boolean
}

const asNum = (v?: string) => parseFloat(v || '0') || 0
const asInt = (v?: string) => parseInt(v || '0') || 0

export const METRICS: MetricDef[] = [
  // BASICO
  { key: 'spend',       label: 'Investido',       category: 'basico', extract: i => asNum(i?.spend), format: formatBRL },
  { key: 'impressions', label: 'Impressoes',      category: 'basico', extract: i => asInt(i?.impressions), format: formatNumber },
  { key: 'reach',       label: 'Alcance',         category: 'basico', extract: i => asInt(i?.reach), format: formatNumber },
  { key: 'frequency',   label: 'Frequencia',      category: 'basico', extract: i => asNum(i?.frequency), format: v => v.toFixed(2), isAverage: true },

  // TRAFEGO
  { key: 'clicks',      label: 'Cliques (todos)', category: 'trafego', extract: i => asInt(i?.clicks), format: formatNumber },
  { key: 'link_clicks', label: 'Cliques no link', category: 'trafego', extract: i => getAction(i?.actions, 'link_click'), format: formatNumber },
  { key: 'ctr',         label: 'CTR',             category: 'trafego', extract: i => asNum(i?.ctr), format: formatPercent, isAverage: true },
  { key: 'cpc',         label: 'CPC',             category: 'trafego', extract: i => asNum(i?.cpc), format: formatBRL, isAverage: true },
  { key: 'cpm',         label: 'CPM',             category: 'trafego', extract: i => asNum(i?.cpm), format: formatBRL, isAverage: true },
  { key: 'page_views',  label: 'Visualizacoes da pagina', category: 'trafego', extract: i => getAction(i?.actions, 'landing_page_view'), format: formatNumber },

  // MENSAGENS
  { key: 'messaging',   label: 'Conversas iniciadas', category: 'mensagens', extract: i => getAction(i?.actions, 'onsite_conversion.messaging_conversation_started_7d'), format: formatNumber },
  { key: 'cost_per_conversation', label: 'Custo por conversa iniciada', category: 'mensagens',
    extract: i => {
      if (!i) return 0
      const conv = getAction(i.actions, 'onsite_conversion.messaging_conversation_started_7d')
      if (conv === 0) return 0
      return asNum(i.spend) / conv
    },
    format: formatBRL, isAverage: true,
  },

  // VENDAS
  { key: 'add_to_cart',       label: 'Adicoes ao carrinho', category: 'vendas', extract: i => getAction(i?.actions, 'add_to_cart') + getAction(i?.actions, 'offsite_conversion.fb_pixel_add_to_cart'), format: formatNumber },
  { key: 'initiate_checkout', label: 'Checkouts iniciados', category: 'vendas', extract: i => getAction(i?.actions, 'initiate_checkout') + getAction(i?.actions, 'offsite_conversion.fb_pixel_initiate_checkout'), format: formatNumber },
  { key: 'purchases',   label: 'Compras',        category: 'vendas', extract: i => getAction(i?.actions, 'purchase') + getAction(i?.actions, 'offsite_conversion.fb_pixel_purchase'), format: formatNumber },
  { key: 'revenue',     label: 'Receita (valor de conversao)', category: 'vendas',
    extract: i => {
      if (!i) return 0
      const av = (i as any).action_values || []
      let total = 0
      for (const a of av) if (a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase') total += parseFloat(a.value || 0)
      return total
    },
    format: formatBRL,
  },
  { key: 'roas',        label: 'ROAS',           category: 'vendas',
    extract: i => {
      if (!i) return 0
      const spend = asNum(i.spend)
      if (spend === 0) return 0
      const av = (i as any).action_values || []
      let rev = 0
      for (const a of av) if (a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase') rev += parseFloat(a.value || 0)
      return rev / spend
    },
    format: v => v.toFixed(2) + 'x',
    isAverage: true,
  },
  { key: 'cost_per_purchase', label: 'Custo por compra', category: 'vendas',
    extract: i => {
      if (!i) return 0
      const purchases = getAction(i.actions, 'purchase') + getAction(i.actions, 'offsite_conversion.fb_pixel_purchase')
      if (purchases === 0) return 0
      return asNum(i.spend) / purchases
    },
    format: formatBRL, isAverage: true,
  },
  { key: 'leads',       label: 'Leads',          category: 'vendas', extract: i => getAction(i?.actions, 'lead') + getAction(i?.actions, 'onsite_conversion.lead_grouped'), format: formatNumber },
  { key: 'cost_per_lead', label: 'Custo por lead', category: 'vendas',
    extract: i => {
      if (!i) return 0
      const leads = getAction(i.actions, 'lead') + getAction(i.actions, 'onsite_conversion.lead_grouped')
      if (leads === 0) return 0
      return asNum(i.spend) / leads
    },
    format: formatBRL, isAverage: true,
  },

  // ENGAJAMENTO
  { key: 'video_views',  label: 'Visualizacoes de video', category: 'engajamento', extract: i => getAction(i?.actions, 'video_view'), format: formatNumber },
  { key: 'post_engagement', label: 'Engajamento com a publicacao', category: 'engajamento', extract: i => getAction(i?.actions, 'post_engagement'), format: formatNumber },
]

export const METRICS_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map(m => [m.key, m]))

export const CATEGORY_LABELS: Record<MetricDef['category'], string> = {
  basico:      'Basico',
  trafego:     'Trafego',
  mensagens:   'Mensagens',
  vendas:      'Vendas',
  engajamento: 'Engajamento',
}

export const CATEGORY_ORDER: MetricDef['category'][] = ['basico', 'trafego', 'mensagens', 'vendas', 'engajamento']

export function getMetric(key: string): MetricDef | null {
  return METRICS_BY_KEY[key] || null
}
