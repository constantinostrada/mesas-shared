import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { AppHeader } from '../../components/AppHeader'
import { errorMessage } from '../../lib/errors'
import { canEdit as roleCanEdit } from '../../types/models'
import type { Card, Column } from '../../types/models'
import { AddColumnForm, ColumnView } from './ColumnView'
import { CardDialog } from './CardDialog'
import { CardView } from './CardItem'
import { resolveMove } from './dnd'
import { byPosition, positionAfterLast } from './positions'
import { useBoard, useBoardMutations } from './useBoard'
import type { CardDraft } from './api'

type Editing = { mode: 'create'; columnId: string } | { mode: 'edit'; card: Card }

export function BoardPage() {
  const { boardId = '' } = useParams()
  const board = useBoard(boardId)
  const m = useBoardMutations(boardId)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  // A small drag threshold so clicking the card buttons still works.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const data = board.data
  const editable = roleCanEdit(data?.role)

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, Card[]>()
    for (const column of data?.columns ?? []) map.set(column.id, [])
    for (const card of data?.cards ?? []) map.get(card.column_id)?.push(card)
    for (const list of map.values()) list.sort(byPosition)
    return map
  }, [data])

  const activeCard = data?.cards.find((c) => c.id === activeId) ?? null

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    if (!data || !e.over) return
    const move = resolveMove(data.cards, String(e.active.id), String(e.over.id))
    if (!move) return
    m.move.mutate({ id: String(e.active.id), columnId: move.columnId, position: move.position })
  }

  const onAddColumn = (title: string) => {
    if (!data) return
    m.addColumn.mutate({ title, position: positionAfterLast(data.columns) })
  }

  const onRenameColumn = (column: Column) => {
    const title = window.prompt('Nuevo título de la columna', column.title)?.trim()
    if (!title || title === column.title) return
    m.editColumn.mutate({ id: column.id, title })
  }

  const onDeleteColumn = (column: Column) => {
    if (!window.confirm(`¿Borrar la columna "${column.title}" y sus cards?`)) return
    m.removeColumn.mutate(column.id)
  }

  const onDeleteCard = (card: Card) => {
    if (!window.confirm(`¿Borrar la card "${card.title}"?`)) return
    m.removeCard.mutate(card.id)
  }

  const onSubmitCard = (draft: CardDraft) => {
    if (!editing) return
    if (editing.mode === 'create') {
      const siblings = cardsByColumn.get(editing.columnId) ?? []
      m.addCard.mutate({
        columnId: editing.columnId,
        draft,
        position: positionAfterLast(siblings),
      })
    } else {
      m.editCard.mutate({ id: editing.card.id, draft })
    }
    setEditing(null)
  }

  if (board.isPending) {
    return (
      <div className="flex h-full flex-col">
        <AppHeader />
        <p className="p-6 text-sm text-slate-500">Cargando board…</p>
      </div>
    )
  }

  if (board.isError || !data) {
    return (
      <div className="flex h-full flex-col">
        <AppHeader />
        <div className="p-6">
          <p className="text-sm text-red-600">
            No se pudo abrir el board: {errorMessage(board.error)}
          </p>
          <Link to="/" className="text-sm text-indigo-600 hover:underline">
            Volver a mis boards
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <span className="truncate font-medium">{data.board.name}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {data.role ?? 'sin rol'}
        </span>
        {!editable && (
          <span className="text-xs text-slate-500">Solo lectura</span>
        )}
      </AppHeader>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <main className="flex flex-1 items-start gap-4 overflow-x-auto p-4">
          {data.columns.map((column) => (
            <ColumnView
              key={column.id}
              column={column}
              cards={cardsByColumn.get(column.id) ?? []}
              members={data.members}
              canEdit={editable}
              onAddCard={(columnId) => setEditing({ mode: 'create', columnId })}
              onEditCard={(card) => setEditing({ mode: 'edit', card })}
              onDeleteCard={onDeleteCard}
              onRenameColumn={onRenameColumn}
              onDeleteColumn={onDeleteColumn}
            />
          ))}
          {editable && <AddColumnForm onAdd={onAddColumn} busy={m.addColumn.isPending} />}
          {!editable && data.columns.length === 0 && (
            <p className="text-sm text-slate-500">Este board todavía no tiene columnas.</p>
          )}
        </main>

        <DragOverlay>
          {activeCard && (
            <div className="w-64">
              <CardView card={activeCard} members={data.members} canEdit={false} dragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {editing && (
        <CardDialog
          card={editing.mode === 'edit' ? editing.card : undefined}
          members={data.members}
          busy={m.addCard.isPending || m.editCard.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={onSubmitCard}
        />
      )}
    </div>
  )
}
