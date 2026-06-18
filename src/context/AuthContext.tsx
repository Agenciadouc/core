import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const API_BASE = import.meta.env.DEV ? '' : '/core'

interface User {
  id: string
  email: string
  name: string
  role: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

// Em embed mode (iframe vindo do /hub), o token de auto-login vem na URL como ?embed_token=XXX
function getEmbedToken(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  return params.get('embed_token')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const embedToken = getEmbedToken()
  const [user, setUser] = useState<User | null>(null)
  // Embed token tem prioridade sobre o que esta salvo (sessao isolada no iframe)
  const [token, setToken] = useState<string | null>(embedToken || localStorage.getItem('dros_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((d) => setUser(d.user))
        .catch(() => {
          // Se o token veio do embed mas falhou, nao limpa o localStorage (preserva sessao normal do usuario)
          if (!embedToken) localStorage.removeItem('dros_token')
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw new Error('Credenciais invalidas')
    const data = await res.json()
    localStorage.setItem('dros_token', data.token)
    setToken(data.token)
    setUser(data.user)
  }

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch { /* ignore */ }
    localStorage.removeItem('dros_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
