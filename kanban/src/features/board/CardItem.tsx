import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, MemberProfile } from '../../types/models'

/** Whoever has this card open right now, in their presence colour. */
export type CardEditor = { color: string; name: string }

type Props = {
  card: Card
  members: MemberProfile[]
  canEdit: boolean
  editedBy?: CardEditor
  onEdit: (card: Card) => void
  onDelete: (card: Card) => void
}

export function CardView({
  card,
  members,
  canEdit,
  editedBy,
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
      className={`relative rounded-lg bg-white p-3 shadow-sm ${
        editedBy ? '' : 'ring-1 ring-slate-200'
      } ${dragging ? 'rotate-1 shadow-lg' : ''}`}
      style={{
        ...(card.color ? { borderLeft: `4px solid ${card.color}` } : null),
        // Someone else has this card open: outline it in their colour.
        ...(editedBy ? { boxShadow: `0 0 0 2px ${editedBy.color}` } : null),
      }}
    >
      {editedBy && (
        <span
          className="absolute -top-2 right-2 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium text-white"
          style={{ backgroundColor: editedBy.color }}
        >
          {editedBy.name} está editando
        </span>
      )}
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
