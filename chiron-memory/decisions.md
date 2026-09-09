# decision

A technical decision that was made and WHY (which alternatives were discarded).

## Fractional index strings for card and column order

What: `position` is a string index (`fractional-indexing`: "a0", "a1", "a0V") instead of an integer, so moving a card between two others writes exactly one row · Why: integer positions force renumbering the whole column on every move, which multiplies writes and loses order under concurrent edits — and this app becomes realtime-collaborative in the next phase · Where: kanban/src/features/board/positions.ts

## Optimistic move lives in a mutation-options factory, not in the hook

What: The optimistic card move (snapshot, cache update, rollback) is built by `moveCardMutationOptions(queryClient, boardId, onError, mutationFn)`, with the request function injected · Why: it is the acceptance-critical behaviour (card returns to its place when the update fails) and this shape lets a test drive it through a MutationObserver with no React, no network and no Supabase client · Where: kanban/src/features/board/moveMutation.ts · Learned: injecting the mutation function is what keeps the Supabase client from being imported at test time, where creating it throws

## Board changes travel by private Realtime broadcast, not Postgres Changes

What: Triggers on `columns` and `cards` call `realtime.broadcast_changes` to the private topic `board:<board_id>`, and a SELECT policy on `realtime.messages` lets only members of that board read it · Why: Realtime does not apply RLS to `DELETE` events, so with Postgres Changes a non-member could subscribe and watch what gets deleted from a board they are not in; a private topic authorizes once, when the channel is joined, which covers the three operations alike — and it sidesteps `cards` having no `board_id` to filter on · Where: kanban/supabase/migrations/20260909000000_realtime_broadcast.sql · Learned: `postgres` is a member of `supabase_realtime_admin` and has BYPASSRLS, so a SECURITY DEFINER trigger owned by it can insert the broadcast that `realtime.messages`' RLS would otherwise reject

## Presence and cursors get their own topic, apart from the change stream

What: Presence, live cursors and the "is editing" flag travel on the private topic `presence:<board_id>`, with SELECT and INSERT policies on `realtime.messages` for board members; `board:<board_id>` keeps only a SELECT policy · Why: clients have to WRITE to send cursors, and an insert policy covering the change topic would let any member push a handcrafted `{table, operation, record}` payload that `applyRemoteChange` cannot tell apart from one the database broadcast — a member could rewrite everyone else's board · Where: kanban/supabase/migrations/20260910000000_presence.sql · Learned: split a Realtime topic in two the moment one direction of it needs client writes; read-only and read-write authorization do not belong on the same topic

## Presence carries identity only; everything mutable is broadcast

What: `channel.track()` is called exactly once per join with `{ userId, email }`; the open card travels as an `editing` broadcast, and a peer who joins later is told about it from the presence `sync` handler · Why: re-tracking a key corrupts the other clients' presence state (see the gotcha), and a broadcast costs one message instead of a leave/join churn on every card that is opened or closed · Where: kanban/src/features/board/presence/usePresence.ts · Learned: presence is a roster, not a state store — put anything that changes during the session on a broadcast beside it
