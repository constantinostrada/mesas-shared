# decision

A technical decision that was made and WHY (which alternatives were discarded).

## Fractional index strings for card and column order

What: `position` is a string index (`fractional-indexing`: "a0", "a1", "a0V") instead of an integer, so moving a card between two others writes exactly one row · Why: integer positions force renumbering the whole column on every move, which multiplies writes and loses order under concurrent edits — and this app becomes realtime-collaborative in the next phase · Where: kanban/src/features/board/positions.ts

## Optimistic move lives in a mutation-options factory, not in the hook

What: The optimistic card move (snapshot, cache update, rollback) is built by `moveCardMutationOptions(queryClient, boardId, onError, mutationFn)`, with the request function injected · Why: it is the acceptance-critical behaviour (card returns to its place when the update fails) and this shape lets a test drive it through a MutationObserver with no React, no network and no Supabase client · Where: kanban/src/features/board/moveMutation.ts · Learned: injecting the mutation function is what keeps the Supabase client from being imported at test time, where creating it throws

## Board changes travel by private Realtime broadcast, not Postgres Changes

What: Triggers on `columns` and `cards` call `realtime.broadcast_changes` to the private topic `board:<board_id>`, and a SELECT policy on `realtime.messages` lets only members of that board read it · Why: Realtime does not apply RLS to `DELETE` events, so with Postgres Changes a non-member could subscribe and watch what gets deleted from a board they are not in; a private topic authorizes once, when the channel is joined, which covers the three operations alike — and it sidesteps `cards` having no `board_id` to filter on · Where: kanban/supabase/migrations/20260909000000_realtime_broadcast.sql · Learned: `postgres` is a member of `supabase_realtime_admin` and has BYPASSRLS, so a SECURITY DEFINER trigger owned by it can insert the broadcast that `realtime.messages`' RLS would otherwise reject
