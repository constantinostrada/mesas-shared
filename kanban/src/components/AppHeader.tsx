import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from './Toast'
import { errorMessage } from '../lib/errors'

export function AppHeader({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth()
  const toast = useToast()

  const onSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
      <Link to="/" className="font-semibold">
        Kanban
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <span className="truncate text-sm text-slate-500">{user?.email}</span>
      <button
        onClick={onSignOut}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
      >
        Salir
      </button>
    </header>
  )
}
