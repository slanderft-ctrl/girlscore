-- Checks the booking rules on a plain local Postgres (not Supabase).
-- Run from the repo root: psql -q < supabase/tests/rules_test.sql
-- It drops and recreates a database called bt, stubbing Supabase's auth schema.
\set ON_ERROR_STOP 1
drop database if exists bt; create database bt; \c bt
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, phone text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
\i supabase/migrations/0001_init.sql
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
\i supabase/seed.sql
\echo '--- sessions generated'
select count(*) from sessions;
insert into auth.users values ('00000000-0000-0000-0000-000000000001',null,'4790000001','{"full_name":"Owner"}'),
 ('00000000-0000-0000-0000-000000000002',null,'4790000002','{"full_name":"Kari"}'),
 ('00000000-0000-0000-0000-000000000003',null,'4790000003','{}');
update profiles set is_admin=true where phone='4790000001';
-- an imminent Tuesday-slot class (inside the 12h cutoff) and a small second group
insert into sessions (group_id, group_time_id, starts_at, ends_at, capacity)
 select group_id, id, now()+interval '2 hours', now()+interval '3 hours', 10 from group_times where weekday=2;
insert into groups (id,name,capacity) values ('30000000-0000-0000-0000-000000000001','Gruppe 2',1);
insert into group_times (id, group_id, weekday, start_time, end_time) values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',5,'10:00','11:00');
select generate_sessions() > 0 as gruppe2_generated;

set role authenticated; set test.uid='00000000-0000-0000-0000-000000000002';
select add_slot((select id from group_times where weekday=2));
select status, count(*) from attendance group by 1;   -- no_pass (no pass yet)
reset role;
insert into payments (id, client_id, pass_type_id, provider, provider_ref, amount_minor, currency)
 select '20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002', id,'vipps','r1',price_minor,currency from pass_types where visits=5;
select fulfil_payment('20000000-0000-0000-0000-000000000001') is not null as paid;
select status, count(*) from attendance group by 1;   -- coming
set role authenticated; set test.uid='00000000-0000-0000-0000-000000000002';
-- Kari: not coming next regular (future) class, more than 12h away
select set_coming((select a.session_id from attendance a join sessions s on s.id=a.session_id where s.starts_at > now()+interval '1 day' order by s.starts_at limit 1), false) as absent_result;
-- Kari: add Gruppe 2 Friday too (group capacity 1)
select add_slot('40000000-0000-0000-0000-000000000001');
set test.uid='00000000-0000-0000-0000-000000000003';
do $$ begin perform add_slot('40000000-0000-0000-0000-000000000001'); exception when others then raise notice 'ola gruppe2 slot -> %', sqlerrm; end $$;
do $$ begin perform book_single((select id from sessions where group_time_id is not null and starts_at > now()+interval '1 day' order by starts_at limit 1)); exception when others then raise notice 'ola single w/o pass -> %', sqlerrm; end $$;
do $$ begin perform lock_due_sessions(); exception when others then raise notice 'client lock -> %', sqlerrm; end $$;
reset role;
\echo '--- lock imminent class'
select lock_due_sessions() as locked;
select visits_left, first_class_at is not null as started, round(extract(epoch from expires_at-first_class_at)/86400) as days from client_passes;
select s.locked_at is not null as locked, a.status, a.counted_at is not null as counted from attendance a join sessions s on s.id=a.session_id where s.starts_at < now()+interval '12 hours';
set role authenticated; set test.uid='00000000-0000-0000-0000-000000000002';
select set_coming((select session_id from attendance where counted_at is not null), false) as late_absent;
-- pause next 3 weeks
select add_pause(current_date, current_date+21);
select count(*) filter (where status='absent') as absent_after_pause from attendance;
reset role;
\echo '--- owner cancels the imminent class -> refund'
set role authenticated; set test.uid='00000000-0000-0000-0000-000000000001';
select cancel_session((select session_id from attendance where counted_at is not null));
select visits_left, first_class_at is null as reset_start from client_passes;
-- owner books Ola single after giving drop-in
reset role;
insert into payments (id, client_id, pass_type_id, provider, amount_minor, currency)
 select '20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003', id,'manual',0,'NOK' from pass_types where visits=1;
select fulfil_payment('20000000-0000-0000-0000-000000000002') is not null;
set role authenticated; set test.uid='00000000-0000-0000-0000-000000000003';
select book_single((select id from sessions where group_time_id = (select id from group_times where weekday=2) and starts_at > now()+interval '1 day' order by starts_at limit 1));
do $$ begin perform book_single((select id from sessions where group_time_id='40000000-0000-0000-0000-000000000001' order by starts_at offset 4 limit 1)); exception when others then raise notice 'ola single full gruppe2 -> %', sqlerrm; end $$;
select count(*) as ola_sees_rows from attendance;
select * from session_spots where taken > 0 order by taken desc limit 3;
reset role;
\echo '--- remove pause, remove slot'
set role authenticated; set test.uid='00000000-0000-0000-0000-000000000002';
select remove_pause((select id from pauses));
select status, count(*) from attendance where client_id='00000000-0000-0000-0000-000000000002' group by 1 order by 1;
select remove_slot('40000000-0000-0000-0000-000000000001');
select count(*) as kari_rows_after_remove from attendance where client_id='00000000-0000-0000-0000-000000000002';
reset role;
set role authenticated; set test.uid='00000000-0000-0000-0000-000000000003';
select update_my_profile('Ola', '');
select full_name, email is null as no_email from profiles;
do $$ begin perform cancel_session((select id from sessions limit 1)); exception when others then raise notice 'client cancel -> %', sqlerrm; end $$;
do $$ begin perform set_coming((select id from sessions limit 1), false, '00000000-0000-0000-0000-000000000002'); exception when others then raise notice 'act for other -> %', sqlerrm; end $$;
reset role;
