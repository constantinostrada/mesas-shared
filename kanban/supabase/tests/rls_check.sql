-- RLS verification: owner / editor / viewer / outsider
begin;

-- Four users, created the way the auth server would (only the columns we need).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@test.dev','x',now(),now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','editor@test.dev','x',now(),now(),now()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@test.dev','x',now(),now(),now()),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider@test.dev','x',now(),now(),now());

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claims = %L', json_build_object('sub', p, 'role','authenticated')::text);
end $$;

-- Owner creates the board (trigger should add the owner membership).
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into public.boards (id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','Board de prueba');
-- Regression: PostgREST always inserts with RETURNING, which also checks the
-- SELECT policy on the new row, before the owner-membership trigger has run.
with ins as (
  insert into public.boards (name) values ('board con returning') returning 1
)
select 'insert ... returning works (expect 1): ' || (select count(*)::text from ins) as check_0;
select 'owner membership created by trigger: ' ||
       (select count(*)::text from public.board_members
        where board_id='aaaaaaaa-0000-0000-0000-000000000001' and role='owner') as check_1;

insert into public.board_members (board_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','viewer');

insert into public.columns (id, board_id, title, position) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','To do','a0'),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Doing','a1');
insert into public.cards (id, column_id, title, position) values
  ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Card A','a0'),
  ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','Card B','a1'),
  ('cccccccc-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000001','Card C','a2');
reset role; reset request.jwt.claims;

-- OUTSIDER: sees nothing, writes nothing.
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select 'outsider boards visible (expect 0): ' || (select count(*)::text from public.boards) as check_2;
select 'outsider columns visible (expect 0): ' || (select count(*)::text from public.columns) as check_3;
select 'outsider cards visible (expect 0): ' || (select count(*)::text from public.cards) as check_4;
with u as (update public.cards set title='hacked' where id='cccccccc-0000-0000-0000-000000000001' returning 1)
select 'outsider card updates (expect 0): ' || (select count(*)::text from u) as check_5;
do $$ begin
  begin
    insert into public.cards (column_id, title, position)
    values ('bbbbbbbb-0000-0000-0000-000000000001','intruso','a9');
    raise notice 'check_6 FAIL: outsider inserted a card';
  exception when insufficient_privilege then
    raise notice 'check_6 OK: outsider insert blocked by RLS';
  end;
end $$;
reset role; reset request.jwt.claims;

-- VIEWER: reads, cannot write.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select 'viewer cards visible (expect 3): ' || (select count(*)::text from public.cards) as check_7;
with u as (update public.cards set title='viewer edit' where id='cccccccc-0000-0000-0000-000000000001' returning 1)
select 'viewer card updates (expect 0): ' || (select count(*)::text from u) as check_8;
with d as (delete from public.columns where id='bbbbbbbb-0000-0000-0000-000000000002' returning 1)
select 'viewer column deletes (expect 0): ' || (select count(*)::text from d) as check_9;
do $$ begin
  begin
    insert into public.cards (column_id, title, position)
    values ('bbbbbbbb-0000-0000-0000-000000000001','del viewer','a9');
    raise notice 'check_10 FAIL: viewer inserted a card';
  exception when insufficient_privilege then
    raise notice 'check_10 OK: viewer insert blocked by RLS';
  end;
end $$;
with d as (delete from public.boards where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select 'viewer board deletes (expect 0): ' || (select count(*)::text from d) as check_11;
reset role; reset request.jwt.claims;

-- EDITOR: full CRUD on columns/cards, cannot delete the board.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
with u as (update public.cards set title='Card A (editada)' where id='cccccccc-0000-0000-0000-000000000001' returning 1)
select 'editor card updates (expect 1): ' || (select count(*)::text from u) as check_12;
insert into public.cards (id, column_id, title, position)
values ('cccccccc-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000002','Card D','a0');
select 'editor inserted a card: ok' as check_13;
-- Move Card C between Card A and Card B: ONE row updated.
with u as (
  update public.cards set position='a0V' where id='cccccccc-0000-0000-0000-000000000003' returning 1
)
select 'rows written to move a card (expect 1): ' || (select count(*)::text from u) as check_14;
select 'order in To do after move: ' || string_agg(title, ' | ' order by position) as check_15
from public.cards where column_id='bbbbbbbb-0000-0000-0000-000000000001';
with d as (delete from public.boards where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select 'editor board deletes (expect 0): ' || (select count(*)::text from d) as check_16;
reset role; reset request.jwt.claims;

-- OWNER: can delete the board.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'owner sees board_member_profiles (expect 3): ' ||
       (select count(*)::text from public.board_member_profiles('aaaaaaaa-0000-0000-0000-000000000001')) as check_17;
with d as (delete from public.boards where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select 'owner board deletes (expect 1): ' || (select count(*)::text from d) as check_18;
reset role; reset request.jwt.claims;

rollback;
