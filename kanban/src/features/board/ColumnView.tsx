import { useState } from 'react'
import type { FormEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card, Column, MemberProfile } from '../../types/models'
import { SortableCard } from './CardItem'
import type { CardEditor } from './CardItem'
import { columnDroppableId } from './dnd'

type Props = {
  column: Column
  cards: Card[]
  members: MemberProfile[]
  canEdit: boolean
  /** Who has each card open, by card id. */
  editors: ReadonlyMap<string, CardEditor>
  onAddCard: (columnId: string) => void
  onEditCard: (card: Card) => void
  onDeleteCard: (card: Card) => void
  onRenameColumn: (column: Column) => void
  onDeleteColumn: (column: Column) => void
}

export function ColumnView({
  column,
  cards,
  members,
  canEdit,
  editors,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onRenameColumn,
  onDeleteColumn,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(column.id) })

  return (
    <section className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-200/60 p-3">
      <header className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 truncate text-sm font-semibold">{column.title}</h2>
        <span className="rounded bg-white px-1.5 text-xs text-slate-500">{cards.length}</span>
        {canEdit && (
          <>
            <button
              onClick={() => onRenameColumn(column)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Renombrar
            </button>
            <button
              onClick={() => onDeleteColumn(column)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Borrar
            </button>
          </>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={`min-h-24 flex-1 rounded-lg p-1 transition-colors ${
          isOver ? 'bg-indigo-100' : ''
        }`}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {cards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                members={members}
                canEdit={canEdit}
                editedBy={editors.get(card.id)}
                onEdit={onEditCard}
                onDelete={onDeleteCard}
              />
            ))}
          </ul>
        </SortableContext>
      </div>

      {canEdit && (
        <button
          onClick={() => onAddCard(column.id)}
          className="mt-2 rounded-md border border-dashed border-slate-400 px-2 py-1.5 text-sm text-slate-600 hover:bg-white"
        >
          + Agregar card
        </button>
      )}
    </section>
  )
}

export function AddColumnForm({ onAdd, busy }: { onAdd: (title: string) => void; busy: boolean }) {
  const [title, setTitle] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setTitle('')
  }
  return (
    <form onSubmit={submit} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-slate-200/40 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nueva columna"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        Agregar columna
      </button>
    </form>
  )
}
