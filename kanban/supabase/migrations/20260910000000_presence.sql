-- Kanban phase 3: the board's presence topic.
--
-- Presence (who is here) and live cursors travel on `presence:<board_id>`,
-- a SECOND private topic, deliberately separate from the `board:<board_id>`
-- change stream of phase 2.
--
-- Why two topics: cursors are sent BY the clients, and letting a client send
-- on a topic means giving `realtime.messages` an INSERT policy for it. If
-- that policy covered the change topic, any member could push a handcrafted
-- INSERT/UPDATE/DELETE payload into every other member's board cache — the
-- reducer cannot tell a forged change from one the database broadcast. So
-- `board:<id>` stays read-only for clients (no insert policy anywhere), and
-- everything clients emit lives here, where the worst a liar can do is draw a
-- cursor in the wrong place.

-- The board a presence topic refers to, or null if the topic is not one of
-- ours. Same regex guard as topic_board_id: a bogus name must fail the policy,
-- not raise an invalid-uuid error.
create or replace function public.presence_topic_board_id(p_topic text)
returns uuid
language sql
immutable
as $$
  select case
    when p_topic ~ '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substring(p_topic from 10)::uuid
  end
$$;

revoke all on function public.presence_topic_board_id(text) from public;
-- The policies below are evaluated as the subscribing user.
grant execute on function public.presence_topic_board_id(text) to authenticated;

-- Realtime runs these with the joiner's JWT and realtime.topic() set to the
-- topic being joined: SELECT decides whether they may listen, INSERT whether
-- they may track presence and send cursors. Both extensions are named because
-- a presence channel carries presence state and broadcast messages alike.
create policy "board members read their presence topic"
  on realtime.messages for select to authenticated
  using (
    extension in ('presence', 'broadcast')
    and public.is_board_member(public.presence_topic_board_id(realtime.topic()))
  );

create policy "board members write their presence topic"
  on realtime.messages for insert to authenticated
  with check (
    extension in ('presence', 'broadcast')
    and public.is_board_member(public.presence_topic_board_id(realtime.topic()))
  );
