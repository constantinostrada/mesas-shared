# architecture

A structural/design choice: layers, module boundaries, where things live.

## The Kanban app lives in kanban/, separate from the mesas-* domain

What: The collaborative Kanban is a standalone Vite + Supabase app under `kanban/`; it shares nothing with the restaurant-order contract in `src/` · Why: the work order asked for a new dedicated app, and `mesas-shared` is only the API/web contract for orders — mixing them would give the contract a build, dependencies and a database · Where: kanban/

## Board permissions are enforced by RLS, the UI only hides controls

What: owner/editor/viewer rules live in Postgres policies backed by SECURITY DEFINER helpers (`board_role`, `is_board_member`, `can_edit_board`, `column_board`); the React UI merely hides the buttons a role cannot use · Why: the client holds an anon key and talks straight to PostgREST, so any UI-only check is advisory — and cards must resolve their board through their column, which a client cannot be trusted to do · Where: kanban/supabase/migrations/20260908000000_initial_schema.sql

## Remote events patch the board cache through one pure reducer

What: `applyRemoteChange(BoardData, RemoteChange)` is a pure function that upserts or drops a row in the cached board; `useBoardRealtime` only owns the channel and feeds it into `setQueryData`, and the board is refetched solely when the channel (re)joins · Why: the acceptance-critical behaviours (no flicker on your own writes, last-write-wins, no duplicate or ghost cards) are then testable with no React, no socket and no Supabase client — the same shape phase 1 used for the optimistic move · Where: kanban/src/features/board/remoteChanges.ts, kanban/src/features/board/useBoardRealtime.ts · Learned: returning the SAME object when the event says nothing new is what keeps TanStack Query from notifying, and that alone removes the flicker from the echo of your own write

## Presence is a pure reducer behind a two-speed store

What: `presenceState.ts` holds pure functions (`syncPeers`, `moveCursor`, `setEditing`, `stepCursors`, `pruneFaded`, `editorsByCard`) over a `Peers` record; `createPresenceStore` publishes only ROSTER changes to React while `CursorLayer` reads positions straight out of the store and writes `transform`/`opacity` onto the DOM in a rAF loop · Why: cursors arrive ~33 times a second per peer and animate at 60 Hz — routing that through the board's React state would re-render every column and card for a moving arrow; and the acceptance-critical behaviours (glide without jumps, fade on disconnect, border while a card is open) stay testable with no React, no socket and no clock · Where: kanban/src/features/board/presence/ · Learned: the same "return the same object when nothing changed" rule as the change reducer is what lets the animation loop idle without notifying anyone
