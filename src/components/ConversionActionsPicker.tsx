// Picker de conversoes: 2 painéis lado a lado (Meta action_types + Google conversion actions)
// Marca os que contam como "conversao" no Overview.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

const API_BASE = import.meta.env.DEV ? '' : '/core'
function getToken(): string | null {
  const embed = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('embed_token') : null
  return embed || (typeof localStorage !== 'undefined' ? localStorage.getItem('dros_token') : null)
}

interface Props {
  metaAccountId?: string
  gadsCustomerId?: string
  metaSelected: string[]
  gadsSelected: string[]
  onMetaChange: (v: string[]) => void
  onGadsChange: (v: string[]) => void
}

interface MetaActionType { action_type: string; total: number }
interface GadsConvAction { id: string; name: string; category: string; type: string }

export default function ConversionActionsPicker({ metaAccountId, gadsCustomerId, metaSelected, gadsSelected, onMetaChange, onGadsChange }: Props) {
  const [metaTypes, setMetaTypes] = useState<MetaActionType[]>([])
  const [gadsActions, setGadsActions] = useState<GadsConvAction[]>([])
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingGads, setLoadingGads] = useState(false)

  useEffect(() => {
    if (!metaAccountId) return
    setLoadingMeta(true)
    fetch(`${API_BASE}/api/meta/accounts/${metaAccountId}/action-types`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => setMetaTypes(d.action_types || []))
      .catch(() => setMetaTypes([]))
      .finally(() => setLoadingMeta(false))
  }, [metaAccountId])

  useEffect(() => {
    if (!gadsCustomerId) return
    setLoadingGads(true)
    fetch(`${API_BASE}/api/google-ads/${gadsCustomerId.replace(/-/g, '')}/conversion-actions`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => setGadsActions(d.actions || []))
      .catch(() => setGadsActions([]))
      .finally(() => setLoadingGads(false))
  }, [gadsCustomerId])

  const toggleMeta = (t: string) => {
    onMetaChange(metaSelected.includes(t) ? metaSelected.filter(x => x !== t) : [...metaSelected, t])
  }
  const toggleGads = (id: string) => {
    onGadsChange(gadsSelected.includes(id) ? gadsSelected.filter(x => x !== id) : [...gadsSelected, id])
  }

  return (
    <div className="conversion-picker">
      <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: metaAccountId && gadsCustomerId ? '1fr 1fr' : '1fr', gap: 20 }}>
          {/* Meta side */}
          {metaAccountId && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
                Meta — action_types que contam como conversao
              </div>
              {loadingMeta && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><Loader2 size={13} className="spin" /> Carregando...</div>}
              {!loadingMeta && metaTypes.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem action_types nos snapshots (rode backfill Meta antes)</div>}
              {!loadingMeta && metaTypes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {metaTypes.map(mt => {
                    const isSel = metaSelected.includes(mt.action_type)
                    return (
                      <button
                        key={mt.action_type}
                        onClick={() => toggleMeta(mt.action_type)}
                        style={{
                          padding: '5px 10px', borderRadius: 5,
                          background: isSel ? 'rgba(52,199,89,0.15)' : 'var(--bg-card)',
                          color: isSel ? '#34C759' : 'var(--text-secondary)',
                          border: `1px solid ${isSel ? 'rgba(52,199,89,0.35)' : 'var(--border-subtle)'}`,
                          fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {isSel ? '✓ ' : ''}{mt.action_type} <span style={{ opacity: 0.55 }}>({Math.round(mt.total)})</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Google side */}
          {gadsCustomerId && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
                Google — conversion actions que contam
              </div>
              {loadingGads && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><Loader2 size={13} className="spin" /> Carregando...</div>}
              {!loadingGads && gadsActions.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem conversion actions configuradas na conta Google</div>}
              {!loadingGads && gadsActions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                  {gadsActions.map(ga => {
                    const isSel = gadsSelected.includes(ga.id)
                    return (
                      <button
                        key={ga.id}
                        onClick={() => toggleGads(ga.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 10px', borderRadius: 5,
                          background: isSel ? 'rgba(52,199,89,0.15)' : 'var(--bg-card)',
                          color: isSel ? '#34C759' : 'var(--text-secondary)',
                          border: `1px solid ${isSel ? 'rgba(52,199,89,0.35)' : 'var(--border-subtle)'}`,
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ width: 14 }}>{isSel ? '✓' : ''}</span>
                        <span style={{ flex: 1 }}>{ga.name}</span>
                        <span style={{ opacity: 0.6, fontSize: 9.5 }}>{ga.category}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
