-- Group stretching studio: passes, fixed weekly groups, "my schedule".
-- Run in the Supabase SQL editor (or `supabase db push`), then 0002_cron.sql.
--
-- How it fits together
--   groups ──< group_times ──< sessions ──< attendance >── profiles
--                   └──< schedule_slots >── profiles   ("my schedule")
--   profiles ──< client_passes >── pass_types, client_passes ── payments
--
-- A client adds weekly slots to "my schedule" and is then signed up for every
-- class of that slot (an attendance row per class). They can mark a class as
-- "not coming" until the cutoff (12 h before). At the cutoff the class is
-- locked and everyone still coming uses one visit from their pass. The first
-- visit used starts the pass's validity period.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create function public.studio_tz() returns text language sql immutable as $$ select 'Europe/Oslo' $$;
create function public.cutoff() returns interval language sql immutable as $$ select interval '12 hours' $$;
create function public.horizon_weeks() returns integer language sql immutable as $$ select 8 $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  full_name text,
  email text,
  notes text, -- private to the owner
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.pass_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  visits integer not null check (visits > 0),
  valid_days integer not null default 30 check (valid_days > 0),
  price_minor integer not null check (price_minor >= 0), -- øre
  currency text not null default 'NOK',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create type public.payment_provider as enum ('stripe', 'vipps', 'manual');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  pass_type_id uuid not null references public.pass_types (id),
  provider public.payment_provider not null,
  provider_ref text, -- Stripe checkout session id / Vipps reference
  amount_minor integer not null,
  currency text not null,
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create unique index payments_provider_ref_idx on public.payments (provider, provider_ref);

create type public.pass_status as enum ('active', 'used_up', 'expired', 'cancelled');

create table public.client_passes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  pass_type_id uuid not null references public.pass_types (id),
  payment_id uuid unique references public.payments (id),
  visits_total integer not null,
  visits_left integer not null check (visits_left >= 0),
  valid_days integer not null,
  first_class_at timestamptz, -- null until the first visit is used
  expires_at timestamptz,     -- first_class_at + valid_days
  status public.pass_status not null default 'active',
  created_at timestamptz not null default now()
);
create index client_passes_client_idx on public.client_passes (client_id);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,            -- "Gruppe 1"
  description text,
  capacity integer not null default 10 check (capacity > 0),
  location text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- The weekly times of a group, e.g. Tuesday 18:00-19:00.
create table public.group_times (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  start_time time not null,
  end_time time not null check (end_time > start_time),
  active boolean not null default true
);

-- Each actual class. Generated from group_times by generate_sessions().
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  group_time_id uuid references public.group_times (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  capacity integer not null check (capacity > 0),
  cancelled boolean not null default false,
  locked_at timestamptz, -- set at the cutoff, when visits are used
  created_at timestamptz not null default now()
);
create unique index sessions_slot_idx on public.sessions (group_time_id, starts_at);
create index sessions_starts_idx on public.sessions (starts_at);

-- "My schedule": the weekly times a client comes to.
create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  group_time_id uuid not null references public.group_times (id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index schedule_slots_active_idx on public.schedule_slots (client_id, group_time_id)
  where ended_at is null;

-- Holidays / sick leave: every regular class in the range is "not coming".
create table public.pauses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  created_at timestamptz not null default now()
);

create type public.attendance_kind as enum ('regular', 'single');
-- coming:    takes a spot, will use a visit at the cutoff
-- absent:    "I won't be there" (no visit used if marked before the cutoff)
-- no_pass:   regular client without a usable pass ("needs a new pass")
-- attended / no_show: optional marks by the owner after the class
-- cancelled: the owner cancelled the class
create type public.attendance_status as enum ('coming', 'absent', 'no_pass', 'attended', 'no_show', 'cancelled');

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  kind public.attendance_kind not null,
  status public.attendance_status not null default 'coming',
  client_pass_id uuid references public.client_passes (id),
  counted_at timestamptz, -- when a visit was taken from the pass
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, client_id)
);
create index attendance_client_idx on public.attendance (client_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email, full_name)
  values (new.id, new.phone, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Statuses that take a spot in a class.
create function public.takes_spot(s public.attendance_status) returns boolean
language sql immutable as $$ select s in ('coming', 'attended', 'no_show') $$;

create function public.spots_taken(p_session_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.attendance
   where session_id = p_session_id and public.takes_spot(status)
$$;

-- The pass a visit at time p_at would come from: started passes first
-- (soonest expiry), then the oldest unstarted pass.
create function public.usable_pass(p_client uuid, p_at timestamptz) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.client_passes
   where client_id = p_client and status = 'active' and visits_left > 0
     and (expires_at is null or expires_at >= p_at)
   order by expires_at asc nulls last, created_at asc
   limit 1
$$;

-- Who is acting: the signed-in client, or any client when the owner acts.
create function public.acting_for(p_client uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_client is null or p_client = auth.uid() then return auth.uid(); end if;
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return p_client;
end $$;

-- Takes one visit from the client's pass for an attendance row, or marks
-- the row "needs a new pass" when there is none.
create function public.count_visit(p_attendance_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  a public.attendance;
  s public.sessions;
  p public.client_passes;
begin
  select * into a from public.attendance where id = p_attendance_id for update;
  if a.counted_at is not null then return true; end if;
  select * into s from public.sessions where id = a.session_id;

  select * into p from public.client_passes
   where id = public.usable_pass(a.client_id, s.starts_at) for update;
  if not found then
    update public.attendance set status = 'no_pass', updated_at = now() where id = a.id;
    return false;
  end if;

  update public.client_passes
     set visits_left = visits_left - 1,
         status = case when visits_left - 1 = 0 then 'used_up'::public.pass_status else status end,
         first_class_at = coalesce(first_class_at, s.starts_at),
         expires_at = coalesce(expires_at, s.starts_at + make_interval(days => valid_days))
   where id = p.id;
  update public.attendance
     set client_pass_id = p.id, counted_at = now(), updated_at = now()
   where id = a.id;
  return true;
end $$;

-- Gives a used visit back (class cancelled, or the owner forgives it).
create function public.refund_visit(p_attendance_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.attendance;
begin
  select * into a from public.attendance where id = p_attendance_id for update;
  if a.counted_at is null or a.client_pass_id is null then return; end if;
  update public.client_passes
     set visits_left = visits_left + 1,
         status = case when status = 'used_up' then 'active'::public.pass_status else status end
   where id = a.client_pass_id;
  update public.attendance set counted_at = null, client_pass_id = null, updated_at = now() where id = a.id;
  -- If that was the only visit used, the pass hasn't started yet.
  update public.client_passes cp set first_class_at = null, expires_at = null
   where cp.id = a.client_pass_id
     and not exists (select 1 from public.attendance x where x.client_pass_id = cp.id);
end $$;

-- Makes a client's upcoming attendance match their schedule, pauses and
-- passes. Safe to run any time.
create function public.sync_client(p_client uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  -- Classes from slots they no longer have.
  delete from public.attendance a
   using public.sessions s
   where a.session_id = s.id and a.client_id = p_client and a.kind = 'regular'
     and s.locked_at is null and a.counted_at is null
     and not exists (select 1 from public.schedule_slots sl
                      where sl.client_id = p_client and sl.group_time_id = s.group_time_id
                        and sl.ended_at is null);

  -- New classes for current slots.
  for r in
    select s.id as session_id, s.starts_at, s.capacity
      from public.schedule_slots sl
      join public.sessions s on s.group_time_id = sl.group_time_id
     where sl.client_id = p_client and sl.ended_at is null
       and s.locked_at is null and not s.cancelled and s.starts_at > now()
       and not exists (select 1 from public.attendance a where a.session_id = s.id and a.client_id = p_client)
     order by s.starts_at
  loop
    insert into public.attendance (session_id, client_id, kind, status)
    values (r.session_id, p_client, 'regular',
      case
        when exists (select 1 from public.pauses pa where pa.client_id = p_client
                      and (r.starts_at at time zone public.studio_tz())::date between pa.starts_on and pa.ends_on)
          then 'absent'
        when public.usable_pass(p_client, r.starts_at) is null then 'no_pass'
        when public.spots_taken(r.session_id) >= r.capacity then 'no_pass'
        else 'coming'
      end::public.attendance_status);
  end loop;

  -- Back in once they have a pass again (e.g. just bought one).
  for r in
    select a.id, s.id as session_id, s.starts_at, s.capacity
      from public.attendance a join public.sessions s on s.id = a.session_id
     where a.client_id = p_client and a.status = 'no_pass' and s.locked_at is null
       and not s.cancelled and s.starts_at > now()
     order by s.starts_at
  loop
    if public.usable_pass(p_client, r.starts_at) is not null
       and public.spots_taken(r.session_id) < r.capacity then
      update public.attendance set status = 'coming', updated_at = now() where id = r.id;
    end if;
  end loop;
end $$;

-- Creates classes for the next horizon_weeks() weeks from each group's
-- weekly times, then signs everyone up per their schedule. Idempotent.
create function public.generate_sessions() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone public.studio_tz())::date;
  v_count integer;
  v_client uuid;
begin
  insert into public.sessions (group_id, group_time_id, starts_at, ends_at, capacity)
  select gt.group_id, gt.id,
         (d + gt.start_time) at time zone public.studio_tz(),
         (d + gt.end_time) at time zone public.studio_tz(),
         g.capacity
    from public.group_times gt
    join public.groups g on g.id = gt.group_id
    cross join (select v_today + i as d from generate_series(0, public.horizon_weeks() * 7) as i) days
   where gt.active and g.active and extract(isodow from d) = gt.weekday
     and (d + gt.start_time) at time zone public.studio_tz() > now()
  on conflict (group_time_id, starts_at) do nothing;
  get diagnostics v_count = row_count;

  for v_client in select distinct client_id from public.schedule_slots where ended_at is null loop
    perform public.sync_client(v_client);
  end loop;
  return v_count;
end $$;

-- Runs every few minutes (see 0002_cron.sql): locks classes that reached the
-- cutoff and uses a visit for everyone still coming.
create function public.lock_due_sessions() returns integer
language plpgsql security definer set search_path = public as $$
declare
  s record;
  a record;
  v_locked integer := 0;
  v_clients uuid[] := '{}';
begin
  for s in
    select id from public.sessions
     where locked_at is null and not cancelled and starts_at - public.cutoff() <= now()
     order by starts_at
     for update skip locked
  loop
    for a in select id, client_id from public.attendance
              where session_id = s.id and status = 'coming' and counted_at is null
    loop
      perform public.count_visit(a.id);
      v_clients := array_append(v_clients, a.client_id);
    end loop;
    update public.sessions set locked_at = now() where id = s.id;
    v_locked := v_locked + 1;
  end loop;

  update public.client_passes set status = 'expired'
   where status = 'active' and expires_at < now();

  -- Anyone whose pass just ran out drops to "needs a new pass" for later classes.
  for a in select distinct unnest(v_clients) as client_id loop
    update public.attendance att set status = 'no_pass', updated_at = now()
      from public.sessions se
     where att.session_id = se.id and att.client_id = a.client_id and att.status = 'coming'
       and att.counted_at is null and se.locked_at is null
       and public.usable_pass(a.client_id, se.starts_at) is null;
  end loop;
  return v_locked;
end $$;

-- ---------------------------------------------------------------------------
-- Actions (called from the app). p_client lets the owner act for a client.
-- ---------------------------------------------------------------------------

-- Add a weekly time to "my schedule".
create function public.add_slot(p_group_time_id uuid, p_client uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := public.acting_for(p_client);
  v_capacity integer;
begin
  select g.capacity into v_capacity
    from public.group_times gt join public.groups g on g.id = gt.group_id
   where gt.id = p_group_time_id and gt.active and g.active
     for update of g;
  if not found then raise exception 'not_available'; end if;
  if exists (select 1 from public.schedule_slots where client_id = v_client
              and group_time_id = p_group_time_id and ended_at is null) then
    return;
  end if;
  if (select count(*) from public.schedule_slots
       where group_time_id = p_group_time_id and ended_at is null) >= v_capacity then
    raise exception 'group_full';
  end if;
  insert into public.schedule_slots (client_id, group_time_id) values (v_client, p_group_time_id);
  perform public.sync_client(v_client);
end $$;

create function public.remove_slot(p_group_time_id uuid, p_client uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := public.acting_for(p_client);
begin
  update public.schedule_slots set ended_at = now()
   where client_id = v_client and group_time_id = p_group_time_id and ended_at is null;
  perform public.sync_client(v_client);
end $$;

-- "I won't be there" (p_coming = false) or "I'll come after all" (true).
-- Returns 'free' if no visit is used, 'used' if the visit is still used.
create function public.set_coming(p_session_id uuid, p_coming boolean, p_client uuid default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := public.acting_for(p_client);
  v_admin boolean := public.is_admin();
  s public.sessions;
  a public.attendance;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.cancelled then raise exception 'not_available'; end if;
  select * into a from public.attendance where session_id = p_session_id and client_id = v_client for update;
  if not found then raise exception 'not_booked'; end if;

  if not p_coming then
    if s.starts_at <= now() and not v_admin then raise exception 'already_started'; end if;
    update public.attendance set status = 'absent', updated_at = now() where id = a.id;
    return case when a.counted_at is null then 'free' else 'used' end;
  end if;

  if public.takes_spot(a.status) then return 'used'; end if;
  if s.starts_at <= now() and not v_admin then raise exception 'already_started'; end if;
  if s.locked_at is not null and a.counted_at is null and not v_admin then raise exception 'too_late'; end if;
  if public.spots_taken(s.id) >= s.capacity and not v_admin then raise exception 'full'; end if;
  if a.counted_at is null and public.usable_pass(v_client, s.starts_at) is null then raise exception 'no_pass'; end if;
  update public.attendance set status = 'coming', updated_at = now() where id = a.id;
  if s.locked_at is not null then perform public.count_visit(a.id); end if;
  return 'used';
end $$;

-- Book one class without adding it to "my schedule" (another group, or drop-in).
create function public.book_single(p_session_id uuid, p_client uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := public.acting_for(p_client);
  v_admin boolean := public.is_admin();
  s public.sessions;
  v_id uuid;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.cancelled then raise exception 'not_available'; end if;
  if exists (select 1 from public.attendance where session_id = p_session_id and client_id = v_client) then
    perform public.set_coming(p_session_id, true, v_client);
    return;
  end if;
  if s.starts_at <= now() and not v_admin then raise exception 'already_started'; end if;
  if public.spots_taken(s.id) >= s.capacity and not v_admin then raise exception 'full'; end if;
  if public.usable_pass(v_client, s.starts_at) is null then raise exception 'no_pass'; end if;
  insert into public.attendance (session_id, client_id, kind) values (p_session_id, v_client, 'single')
  returning id into v_id;
  if s.locked_at is not null then perform public.count_visit(v_id); end if;
end $$;

create function public.add_pause(p_starts_on date, p_ends_on date, p_client uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := public.acting_for(p_client);
begin
  insert into public.pauses (client_id, starts_on, ends_on) values (v_client, p_starts_on, p_ends_on);
  update public.attendance a set status = 'absent', updated_at = now()
    from public.sessions s
   where a.session_id = s.id and a.client_id = v_client and a.kind = 'regular'
     and s.locked_at is null and a.status in ('coming', 'no_pass')
     and (s.starts_at at time zone public.studio_tz())::date between p_starts_on and p_ends_on;
end $$;

create function public.remove_pause(p_pause_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pa public.pauses;
  r record;
begin
  select * into pa from public.pauses where id = p_pause_id;
  if not found then return; end if;
  perform public.acting_for(pa.client_id);
  delete from public.pauses where id = p_pause_id;
  for r in
    select s.id from public.attendance a join public.sessions s on s.id = a.session_id
     where a.client_id = pa.client_id and a.kind = 'regular' and a.status = 'absent'
       and s.locked_at is null and not s.cancelled and s.starts_at > now()
       and (s.starts_at at time zone public.studio_tz())::date between pa.starts_on and pa.ends_on
  loop
    begin
      perform public.set_coming(r.id, true, pa.client_id);
    exception when others then
      update public.attendance set status = 'no_pass', updated_at = now()
       where session_id = r.id and client_id = pa.client_id;
    end;
  end loop;
end $$;

create function public.update_my_profile(p_full_name text, p_email text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set full_name = nullif(trim(p_full_name), ''), email = nullif(trim(p_email), '')
   where id = auth.uid()
$$;

-- Owner: cancel a class. Everyone gets their visit back.
create function public.cancel_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  for a in select id from public.attendance where session_id = p_session_id loop
    perform public.refund_visit(a.id);
  end loop;
  update public.attendance set status = 'cancelled', updated_at = now() where session_id = p_session_id;
  update public.sessions set cancelled = true where id = p_session_id;
  for a in select distinct client_id from public.attendance where session_id = p_session_id loop
    perform public.sync_client(a.client_id);
  end loop;
end $$;

-- Owner: give a used visit back for one client.
create function public.return_visit(p_attendance_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  perform public.refund_visit(p_attendance_id);
  perform public.sync_client((select client_id from public.attendance where id = p_attendance_id));
end $$;

-- Mark a payment paid and issue the pass. Safe to call more than once.
create function public.fulfil_payment(p_payment_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_type public.pass_types;
  v_pass uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;

  select id into v_pass from public.client_passes where payment_id = p_payment_id;
  if v_pass is not null then return v_pass; end if;

  update public.payments set status = 'paid', paid_at = coalesce(paid_at, now()) where id = p_payment_id;
  select * into v_type from public.pass_types where id = v_payment.pass_type_id;
  insert into public.client_passes (client_id, pass_type_id, payment_id, visits_total, visits_left, valid_days)
  values (v_payment.client_id, v_type.id, p_payment_id, v_type.visits, v_type.visits, v_type.valid_days)
  returning id into v_pass;

  perform public.sync_client(v_payment.client_id);
  return v_pass;
end $$;

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------

-- Spots per class, readable by anyone (no names).
create view public.session_spots with (security_invoker = false) as
  select s.id as session_id, s.capacity,
         count(a.id) filter (where public.takes_spot(a.status))::int as taken
    from public.sessions s
    left join public.attendance a on a.session_id = s.id
   group by s.id;

-- Members per weekly time, readable by anyone (no names).
create view public.group_time_spots with (security_invoker = false) as
  select gt.id as group_time_id, g.capacity,
         count(sl.id) filter (where sl.ended_at is null)::int as members
    from public.group_times gt
    join public.groups g on g.id = gt.group_id
    left join public.schedule_slots sl on sl.group_time_id = gt.id
   group by gt.id, g.capacity;

-- ---------------------------------------------------------------------------
-- Row level security: clients see their own data, the owner sees everything.
-- Clients change data only through the functions above.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.pass_types enable row level security;
alter table public.payments enable row level security;
alter table public.client_passes enable row level security;
alter table public.groups enable row level security;
alter table public.group_times enable row level security;
alter table public.sessions enable row level security;
alter table public.schedule_slots enable row level security;
alter table public.pauses enable row level security;
alter table public.attendance enable row level security;

create policy "own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admin" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "read on sale" on public.pass_types for select using (active or public.is_admin());
create policy "admin" on public.pass_types for all using (public.is_admin()) with check (public.is_admin());

create policy "read" on public.groups for select using (true);
create policy "admin" on public.groups for all using (public.is_admin()) with check (public.is_admin());
create policy "read" on public.group_times for select using (true);
create policy "admin" on public.group_times for all using (public.is_admin()) with check (public.is_admin());
create policy "read" on public.sessions for select using (true);
create policy "admin" on public.sessions for all using (public.is_admin()) with check (public.is_admin());

create policy "own or admin" on public.payments for select using (client_id = auth.uid() or public.is_admin());
create policy "admin" on public.payments for all using (public.is_admin()) with check (public.is_admin());
create policy "own or admin" on public.client_passes for select using (client_id = auth.uid() or public.is_admin());
create policy "admin" on public.client_passes for all using (public.is_admin()) with check (public.is_admin());
create policy "own or admin" on public.schedule_slots for select using (client_id = auth.uid() or public.is_admin());
create policy "admin" on public.schedule_slots for all using (public.is_admin()) with check (public.is_admin());
create policy "own or admin" on public.pauses for select using (client_id = auth.uid() or public.is_admin());
create policy "admin" on public.pauses for all using (public.is_admin()) with check (public.is_admin());
create policy "own or admin" on public.attendance for select using (client_id = auth.uid() or public.is_admin());
create policy "admin" on public.attendance for all using (public.is_admin()) with check (public.is_admin());

grant select on public.session_spots, public.group_time_spots to anon, authenticated;

-- Internal helpers are not callable from the app.
revoke execute on function public.count_visit(uuid), public.refund_visit(uuid), public.sync_client(uuid),
  public.lock_due_sessions(), public.generate_sessions(), public.fulfil_payment(uuid)
  from public, anon, authenticated;
grant execute on function public.count_visit(uuid), public.refund_visit(uuid), public.sync_client(uuid),
  public.lock_due_sessions(), public.generate_sessions(), public.fulfil_payment(uuid)
  to service_role;
