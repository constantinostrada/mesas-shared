import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, MemberProfile } from '../../types/models'

type Props = {
  card: Card
  members: MemberProfile[]
  canEdit: boolean
  onEdit: (card: Card) => void
  onDelete: (card: Card) => void
}

export function CardView({
  card,
  members,
  canEdit,
  onEdit,
  onDelete,
  dragging,
}: Omit<Props, 'onEdit' | 'onDelete'> & {
  onEdit?: (card: Card) => void
  onDelete?: (card: Card) => void
  dragging?: boolean
}) {
  const assignee = members.find((m) => m.user_id === card.assignee_id)
  return (
    <div
      className={`rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 ${
        dragging ? 'rotate-1 shadow-lg' : ''
      }`}
      style={card.color ? { borderLeft: `4px solid ${card.color}` } : undefined}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-medium break-words">{card.title}</p>
        {canEdit && onEdit && onDelete && (
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => onEdit(card)}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-xs text-slate-500 hover:text-slate-900"
              aria-label={`Editar ${card.title}`}
            >
              Editar
            </button>
            <button
              onClick={() => onDelete(card)}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-xs text-red-500 hover:text-red-700"
              aria-label={`Borrar ${card.title}`}
            >
              Borrar
            </button>
          </div>
        )}
      </div>
      {card.description && (
        <p className="mt-1 text-xs whitespace-pre-wrap text-slate-600">{card.description}</p>
      )}
      {assignee && (
        <p className="mt-2 truncate text-xs text-slate-500" title={assignee.email}>
          {assignee.email}
        </p>
      )}
    </div>
  )
}

export function SortableCard(props: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.card.id,
    disabled: !props.canEdit,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${isDragging ? 'opacity-40' : ''} ${props.canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
      {...attributes}
      {...listeners}
    >
      <CardView {...props} />
    </li>
  )
}
