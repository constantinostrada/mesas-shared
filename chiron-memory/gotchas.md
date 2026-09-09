# gotcha

Something non-obvious that failed or must be kept in mind to avoid repeating (bugs, surprises, lessons).

## INSERT ... RETURNING also checks the SELECT policy

What: `boards`' SELECT policy had to accept `owner_id = auth.uid()` on top of membership, because PostgREST always inserts with RETURNING and Postgres evaluates the SELECT policy on the new row before the AFTER INSERT trigger creates the owner's `board_members` row · Why: with a membership-only SELECT policy every board creation failed with "new row violates row-level security policy", while the same INSERT without RETURNING succeeded — which makes the bug look like a broken WITH CHECK · Where: kanban/supabase/migrations/20260908000000_initial_schema.sql · Learned: when a row's read permission depends on a row an AFTER INSERT trigger creates, the SELECT policy must also match the row directly, or the API insert can never read back what it just wrote

## dnd-kit ignores a synthetic pointerup that still has buttons=1

What: Simulated drags in the browser only completed when the final `pointerup` carried `buttons: 0`; with `buttons: 1` dnd-kit kept the drag active and no drop ever fired · Why: cost about an hour of chasing a non-existent bug in the drop-resolution code · Where: kanban/src/features/board/dnd.ts · Learned: a real pointerup reports no buttons pressed — script drags accordingly, and check dnd-kit's own live-region text ("moved over" vs "dropped over") to tell an unfinished drag from a rejected drop

## Realtime never applies RLS to DELETE events

What: Postgres Changes delivers `DELETE` to every subscriber regardless of RLS (there is no row left to evaluate a policy against), and its `filter` only works on deletes if the table is `replica identity full` · Why: it quietly breaks "a non-member receives no events of that board" — the part of an authorization story that is easiest to assume and hardest to notice · Where: kanban/supabase/migrations/20260909000000_realtime_broadcast.sql · Learned: if deletes must be authorized, put the change stream on a private topic (broadcast from the database) where the check happens at channel join, and verify it with a real outsider client — the refusal shows up as CHANNEL_ERROR "Unauthorized", not as an empty stream

## One CASE over TG_TABLE_NAME breaks a shared trigger function

What: In a trigger function shared by two tables, `case tg_table_name when 'columns' then new.board_id else public.column_board(new.column_id) end` fails with `record "new" has no field "column_id"` · Why: plpgsql plans the whole CASE as one SQL expression, so every branch's field references must exist on the triggering row — the branch never taken still has to resolve · Where: kanban/supabase/migrations/20260909000000_realtime_broadcast.sql · Learned: split the branches into separate IF statements, each its own plan, when a trigger function serves tables with different columns

## Calling track() twice on a presence key corrupts every other client's roster

What: A second `channel.track()` with a changed payload leaves TWO metas under that key in the other clients' `presenceState()`, both stripped of their `presence_ref` — and because leaves are matched by ref, that key then NEVER disappears when its owner untracks or closes the tab · Why: it silently breaks "the avatar disappears when the tab closes", and it looks like a leave-detection bug rather than a track bug · Where: kanban/src/features/board/presence/usePresence.ts · Learned: track once per join and send changes as broadcasts; `untrack()` before a fresh `track()` does keep the state clean, but it makes the peer blink out of the roster in between

## supabase.channel(topic) returns the channel that already exists for that topic

What: A cleanup that deferred `removeChannel` (`channel.untrack().finally(...)`) left the channel in the client's list, so React StrictMode's immediate remount got the SAME, already-subscribed channel back and `channel.on('presence', ...)` threw "cannot add presence callbacks after subscribe()" — a blank board in dev · Why: the tests never saw it (no StrictMode, no remount) and the message points at the binding, not at the cleanup · Where: kanban/src/features/board/presence/usePresence.ts · Learned: remove a Realtime channel synchronously in the effect cleanup, and do not untrack first — leaving the topic drops the client's presence anyway
