# architecture

A structural/design choice: layers, module boundaries, where things live.

## The Kanban app lives in kanban/, separate from the mesas-* domain

What: The collaborative Kanban is a standalone Vite + Supabase app under `kanban/`; it shares nothing with the restaurant-order contract in `src/` · Why: the work order asked for a new dedicated app, and `mesas-shared` is only the API/web contract for orders — mixing them would give the contract a build, dependencies and a database · Where: kanban/

## Board permissions are enforced by RLS, the UI only hides controls

What: owner/editor/viewer rules live in Postgres policies backed by SECURITY DEFINER helpers (`board_role`, `is_board_member`, `can_edit_board`, `column_board`); the React UI merely hides the buttons a role cannot use · Why: the client holds an anon key and talks straight to PostgREST, so any UI-only check is advisory — and cards must resolve their board through their column, which a client cannot be trusted to do · Where: kanban/supabase/migrations/20260908000000_initial_schema.sql
