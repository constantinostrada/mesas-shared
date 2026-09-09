# gotcha

Something non-obvious that failed or must be kept in mind to avoid repeating (bugs, surprises, lessons).

## INSERT ... RETURNING also checks the SELECT policy

What: `boards`' SELECT policy had to accept `owner_id = auth.uid()` on top of membership, because PostgREST always inserts with RETURNING and Postgres evaluates the SELECT policy on the new row before the AFTER INSERT trigger creates the owner's `board_members` row · Why: with a membership-only SELECT policy every board creation failed with "new row violates row-level security policy", while the same INSERT without RETURNING succeeded — which makes the bug look like a broken WITH CHECK · Where: kanban/supabase/migrations/20260908000000_initial_schema.sql · Learned: when a row's read permission depends on a row an AFTER INSERT trigger creates, the SELECT policy must also match the row directly, or the API insert can never read back what it just wrote

## dnd-kit ignores a synthetic pointerup that still has buttons=1

What: Simulated drags in the browser only completed when the final `pointerup` carried `buttons: 0`; with `buttons: 1` dnd-kit kept the drag active and no drop ever fired · Why: cost about an hour of chasing a non-existent bug in the drop-resolution code · Where: kanban/src/features/board/dnd.ts · Learned: a real pointerup reports no buttons pressed — script drags accordingly, and check dnd-kit's own live-region text ("moved over" vs "dropped over") to tell an unfinished drag from a rejected drop
