-- Kanban phase 1: schema, membership roles and RLS.
-- Positions are fractional-index strings (see fractional-indexing on npm),
-- so a card can be moved between two neighbours by updating a single row.

create type public.board_role as enum ('owner', 'editor', 'viewer');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.boards (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.board_members (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  role     public.board_role not null,
  primary key (board_id, user_id)
);
create index board_members_user_id_idx on public.board_members (user_id);

create table public.columns (
  id       uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  title    text not null check (char_length(title) between 1 and 120),
  position text not null check (position <> '')
);
create index columns_board_position_idx on public.columns (board_id, position);

create table public.cards (
  id          uuid primary key default gen_random_uuid(),
  column_id   uuid not null references public.columns (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  position    text not null check (position <> ''),
  assignee_id uuid references auth.users (id) on delete set null,
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now()
);
create index cards_column_position_idx on public.cards (column_id, position);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can read board_members without
-- recursing into board_members' own RLS).
-- ---------------------------------------------------------------------------

create or replace function public.board_role(p_board_id uuid)
returns public.board_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.board_members
  where board_id = p_board_id
    and user_id = auth.uid()
$$;

create or replace function public.is_board_member(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.board_role(p_board_id) is not null
$$;

create or replace function public.can_edit_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.board_role(p_board_id) in ('owner', 'editor')
$$;

-- Resolve a card's board through its column, bypassing RLS on columns.
create or replace function public.column_board(p_column_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select board_id from public.columns where id = p_column_id
$$;

-- Members of a board with their email, for the assignee picker.
-- auth.users is not readable from the client, hence SECURITY DEFINER,
-- guarded by the caller's own membership.
create or replace function public.board_member_profiles(p_board_id uuid)
returns table (user_id uuid, email text, role public.board_role)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, u.email::text, m.role
  from public.board_members m
  join auth.users u on u.id = m.user_id
  where m.board_id = p_board_id
    and public.is_board_member(p_board_id)
  order by u.email
$$;

revoke all on function public.board_role(uuid) from public;
revoke all on function public.is_board_member(uuid) from public;
revoke all on function public.can_edit_board(uuid) from public;
revoke all on function public.column_board(uuid) from public;
revoke all on function public.board_member_profiles(uuid) from public;
grant execute on function public.board_role(uuid) to authenticated;
grant execute on function public.is_board_member(uuid) to authenticated;
grant execute on function public.can_edit_board(uuid) to authenticated;
grant execute on function public.column_board(uuid) to authenticated;
grant execute on function public.board_member_profiles(uuid) to authenticated;

-- The creator of a board becomes its owner member automatically.
create or replace function public.handle_new_board()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.board_members (board_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_board_created
after insert on public.boards
for each row execute function public.handle_new_board();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.boards        enable row level security;
alter table public.board_members enable row level security;
alter table public.columns       enable row level security;
alter table public.cards         enable row level security;

-- boards: members read; anyone authenticated creates their own; only the
-- owner renames or deletes.
-- The owner is matched directly, not only through board_members: an
-- INSERT ... RETURNING (what PostgREST always issues) checks the SELECT
-- policy on the new row BEFORE the AFTER INSERT trigger has created the
-- owner's membership row, so a membership-only policy would reject it.
create policy "boards: members can read"
  on public.boards for select to authenticated
  using (owner_id = auth.uid() or public.is_board_member(id));

create policy "boards: users create their own"
  on public.boards for insert to authenticated
  with check (owner_id = auth.uid());

create policy "boards: owner updates"
  on public.boards for update to authenticated
  using (public.board_role(id) = 'owner')
  with check (public.board_role(id) = 'owner' and owner_id = auth.uid());

create policy "boards: owner deletes"
  on public.boards for delete to authenticated
  using (public.board_role(id) = 'owner');

-- board_members: members see who else is in; only the owner manages
-- membership (no UI for this in phase 1; rows are inserted manually).
create policy "board_members: members can read"
  on public.board_members for select to authenticated
  using (public.is_board_member(board_id));

create policy "board_members: owner inserts"
  on public.board_members for insert to authenticated
  with check (public.board_role(board_id) = 'owner');

create policy "board_members: owner updates"
  on public.board_members for update to authenticated
  using (public.board_role(board_id) = 'owner')
  with check (public.board_role(board_id) = 'owner');

create policy "board_members: owner deletes"
  on public.board_members for delete to authenticated
  using (public.board_role(board_id) = 'owner');

-- columns: members read; owner/editor write. Viewers cannot write.
create policy "columns: members can read"
  on public.columns for select to authenticated
  using (public.is_board_member(board_id));

create policy "columns: editors insert"
  on public.columns for insert to authenticated
  with check (public.can_edit_board(board_id));

create policy "columns: editors update"
  on public.columns for update to authenticated
  using (public.can_edit_board(board_id))
  with check (public.can_edit_board(board_id));

create policy "columns: editors delete"
  on public.columns for delete to authenticated
  using (public.can_edit_board(board_id));

-- cards: same as columns, resolved through the card's column.
create policy "cards: members can read"
  on public.cards for select to authenticated
  using (public.is_board_member(public.column_board(column_id)));

create policy "cards: editors insert"
  on public.cards for insert to authenticated
  with check (public.can_edit_board(public.column_board(column_id)));

create policy "cards: editors update"
  on public.cards for update to authenticated
  using (public.can_edit_board(public.column_board(column_id)))
  with check (public.can_edit_board(public.column_board(column_id)));

create policy "cards: editors delete"
  on public.cards for delete to authenticated
  using (public.can_edit_board(public.column_board(column_id)));
