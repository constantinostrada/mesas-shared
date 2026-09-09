import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { errorMessage } from '../lib/errors'

export function LoginPage() {
  const { user, loading, signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (!loading && user) return <Navigate to="/" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setStatus('sending')
    try {
      await signInWithMagicLink(email.trim())
      setStatus('sent')
    } catch (err) {
      setError(errorMessage(err))
      setStatus('idle')
    }
  }

  return (
    <main className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow">
        <h1 className="mb-1 text-xl font-semibold">Kanban</h1>
        <p className="mb-5 text-sm text-slate-600">
          Ingresá tu email y te mandamos un link para entrar.
        </p>

        {status === 'sent' ? (
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            Te enviamos un link a <strong>{email}</strong>. Abrilo para entrar.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="vos@ejemplo.com"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {status === 'sending' ? 'Enviando…' : 'Enviarme el link'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
