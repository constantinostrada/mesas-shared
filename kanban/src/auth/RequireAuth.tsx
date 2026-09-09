import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Cargando sesión…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
