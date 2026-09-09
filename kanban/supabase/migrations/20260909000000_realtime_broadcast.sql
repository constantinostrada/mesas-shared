-- Kanban phase 2: the board's change stream.
--
-- Every write to columns and cards is broadcast to the PRIVATE Realtime topic
-- `board:<board_id>`, and realtime.messages only lets members of that board
-- read the topic. Postgres Changes was the other option and was rejected:
-- Realtime does not apply RLS to DELETE events (there is no row left to check
-- a policy against), so a non-member could subscribe and watch what gets
-- deleted from a board they are not in. Here authorization happens once, when
-- the channel is joined, so it holds for the three operations alike.

-- The board a private topic refers to, or null if the topic is not one of
-- ours. Guarded by a regex so a bogus topic name is a policy failure and not
-- an invalid-uuid error.
create or replace function public.topic_board_id(p_topic text)
returns uuid
language sql
immutable
as $$
  select case
    when p_topic ~ '^board:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substring(p_topic from 7)::uuid
  end
$$;

-- SECURITY DEFINER because realtime.messages has RLS and no insert policy:
-- the write has to happen as the migration's owner, not as the member who
-- moved the card.
create or replace function public.broadcast_board_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
begin
  -- Each branch is its own statement on purpose: a single CASE expression
  -- would have to resolve new.board_id and new.column_id in the same plan,
  -- and only one of the two exists per table ("record new has no field ...").
  if tg_table_name = 'columns' then
    if tg_op = 'DELETE' then
      v_board_id := old.board_id;
    else
      v_board_id := new.board_id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_board_id := public.column_board(old.column_id);
    else
      v_board_id := public.column_board(new.column_id);
    end if;
  end if;

  if v_board_id is null then
    return null;
  end if;

  -- A board that cannot be broadcast is still a board that was edited: the
  -- write must not be rolled back because the notification failed.
  begin
    perform realtime.broadcast_changes(
      'board:' || v_board_id::text,
      tg_op,      -- event name, so the client can bind per operation
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  exception when others then
    raise warning 'broadcast_board_change failed for % on %: %', tg_op, tg_table_name, sqlerrm;
  end;

  return null;
end;
$$;

revoke all on function public.topic_board_id(text) from public;
revoke all on function public.broadcast_board_change() from public;
-- The policy on realtime.messages is evaluated as the subscribing user.
grant execute on function public.topic_board_id(text) to authenticated;

create trigger columns_broadcast_changes
after insert or update or delete on public.columns
for each row execute function public.broadcast_board_change();

create trigger cards_broadcast_changes
after insert or update or delete on public.cards
for each row execute function public.broadcast_board_change();

-- Realtime authorizes a private topic by running this policy with the
-- subscriber's JWT and realtime.topic() set to the topic being joined.
-- is_board_member(null) is false, so topics that are not ours are refused.
create policy "board members read their board topic"
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and public.is_board_member(public.topic_board_id(realtime.topic()))
  );
