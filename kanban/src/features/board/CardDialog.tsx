import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Card, MemberProfile } from '../../types/models'
import type { CardDraft } from './api'

export const CARD_COLORS = [
  { value: null, label: 'Sin color' },
  { value: '#fca5a5', label: 'Rojo' },
  { value: '#fdba74', label: 'Naranja' },
  { value: '#fde047', label: 'Amarillo' },
  { value: '#86efac', label: 'Verde' },
  { value: '#93c5fd', label: 'Azul' },
  { value: '#c4b5fd', label: 'Violeta' },
]

type Props = {
  card?: Card
  members: MemberProfile[]
  busy?: boolean
  onCancel: () => void
  onSubmit: (draft: CardDraft) => void
}

export function CardDialog({ card, members, busy, onCancel, onSubmit }: Props) {
  const [title, setTitle] = useState(card?.title ?? '')
  const [description, setDescription] = useState(card?.description ?? '')
  const [color, setColor] = useState<string | null>(card?.color ?? null)
  const [assignee, setAssignee] = useState<string | null>(card?.assignee_id ?? null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onSubmit({ title: trimmed, description: description.trim(), color, assignee_id: assignee })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{card ? 'Editar card' : 'Nueva card'}</h2>

        <label className="mb-1 block text-sm font-medium" htmlFor="card-title">
          Título
        </label>
        <input
          id="card-title"
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium" htmlFor="card-desc">
          Descripción
        </label>
        <textarea
          id="card-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium" htmlFor="card-assignee">
          Asignada a
        </label>
        <select
          id="card-assignee"
          value={assignee ?? ''}
          onChange={(e) => setAssignee(e.target.value || null)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Sin asignar</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.email}
            </option>
          ))}
        </select>

        <span className="mb-1 block text-sm font-medium">Color</span>
        <div className="mb-5 flex flex-wrap gap-2">
          {CARD_COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              aria-label={c.label}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
              className={`h-7 w-7 rounded-full border-2 ${
                color === c.value ? 'border-slate-900' : 'border-slate-200'
              }`}
              style={{ backgroundColor: c.value ?? '#ffffff' }}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
