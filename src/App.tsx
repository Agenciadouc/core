import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PublicDashboard from './pages/PublicDashboard'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-container" style={{ height: '100vh' }}>
        <div className="spinner" />
        <span>Carregando...</span>
      </div>
    )
  }

  return (
    <Routes>
      {/* Rota publica — nao exige login */}
      <Route path="/public/:slug" element={<PublicDashboard />} />
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/*" element={user ? <Dashboard /> : <Navigate to="/login" />} />
    </Routes>
  )
}
