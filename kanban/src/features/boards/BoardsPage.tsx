import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import { useBoardMutations, useBoards } from './useBoards'
import type { BoardWithRole } from './api'

const roleLabel: Record<BoardWithRole['role'], string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

export function BoardsPage() {
  const boards = useBoards()
  const { create, rename, remove } = useBoardMutations()
  const toast = useToast()
  const [newName, setNewName] = useState('')

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    try {
      await create.mutateAsync(name)
      setNewName('')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const onRename = async (board: BoardWithRole) => {
    const name = window.prompt('Nuevo nombre del board', board.name)?.trim()
    if (!name || name === board.name) return
    try {
      await rename.mutateAsync({ id: board.id, name })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const onDelete = async (board: BoardWithRole) => {
    if (!window.confirm(`¿Borrar el board "${board.name}" con todas sus columnas y cards?`)) return
    try {
      await remove.mutateAsync(board.id)
      toast.success('Board borrado')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <h1 className="mb-4 text-2xl font-semibold">Mis boards</h1>

        <form onSubmit={onCreate} className="mb-6 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del nuevo board"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={create.isPending || !newName.trim()}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Crear
          </button>
        </form>

        {boards.isPending && <p className="text-sm text-slate-500">Cargando…</p>}
        {boards.isError && (
          <p className="text-sm text-red-600">{errorMessage(boards.error)}</p>
        )}
        {boards.data && boards.data.length === 0 && (
          <p className="text-sm text-slate-500">
            Todavía no sos miembro de ningún board. Creá uno arriba.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {boards.data?.map((board) => (
            <li
              key={board.id}
              className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 shadow-sm"
            >
              <Link to={`/boards/${board.id}`} className="flex-1 font-medium hover:underline">
                {board.name}
              </Link>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {roleLabel[board.role]}
              </span>
              {board.role === 'owner' && (
                <>
                  <button
                    onClick={() => onRename(board)}
                    className="text-sm text-slate-600 hover:underline"
                  >
                    Renombrar
                  </button>
                  <button
                    onClick={() => onDelete(board)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Borrar
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
