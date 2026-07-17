-- Fantasy Fitness League schema
-- Timezone for weekly cutoffs: America/New_York (US Eastern)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_display_name_lower_uidx
  on public.profiles (lower(display_name));

create or replace function public.is_display_name_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(display_name) = lower(trim(p_name))
  );
$$;

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint seasons_date_order check (end_date > start_date),
  constraint seasons_unique_window unique (start_date, end_date)
);

create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  invite_code text not null unique,
  is_active boolean not null default false,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pool_members (
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  total_points integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

create table if not exists public.matchups (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_a_id uuid not null references auth.users (id) on delete cascade,
  user_b_id uuid not null references auth.users (id) on delete cascade,
  week_start timestamptz not null,
  week_end timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint matchups_distinct_users check (user_a_id <> user_b_id),
  constraint matchups_week_order check (week_end > week_start)
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  matchup_id uuid not null references public.matchups (id) on delete cascade,
  weight_unit text not null check (weight_unit in ('lb', 'kg')),
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  matchup_id uuid not null references public.matchups (id) on delete cascade,
  exercise_name text not null,
  sets integer not null check (sets > 0),
  reps_per_set integer check (reps_per_set > 0),
  reps integer not null check (reps > 0),
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  set_number integer not null check (set_number > 0),
  weight numeric(10, 2) not null check (weight >= 0),
  reps integer not null check (reps > 0),
  created_at timestamptz not null default now(),
  unique (workout_id, set_number)
);

create index if not exists idx_pools_invite_code on public.pools (invite_code);
create index if not exists idx_pools_season on public.pools (season_id);
create index if not exists idx_pool_members_user on public.pool_members (user_id);
create index if not exists idx_matchups_pool_active on public.matchups (pool_id, is_active);
create index if not exists idx_matchups_users on public.matchups (user_a_id, user_b_id);
create index if not exists idx_workout_sessions_matchup on public.workout_sessions (matchup_id);
create index if not exists idx_workout_sessions_user on public.workout_sessions (user_id);
create index if not exists idx_workouts_session on public.workouts (session_id);
create index if not exists idx_workouts_matchup on public.workouts (matchup_id);
create index if not exists idx_workouts_user on public.workouts (user_id);
create index if not exists idx_workout_sets_workout on public.workout_sets (workout_id, set_number);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.eastern_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

create or replace function public.current_week_bounds_et()
returns table (week_start timestamptz, week_end timestamptz)
language plpgsql
stable
as $$
declare
  et_today date;
  monday date;
  sunday date;
begin
  et_today := (timezone('America/New_York', now()))::date;
  monday := et_today - ((extract(isodow from et_today)::int) - 1);
  sunday := monday + 6;

  week_start := (monday::timestamp at time zone 'America/New_York');
  week_end := ((sunday::timestamp + time '23:59:59.999') at time zone 'America/New_York');
  return next;
end;
$$;

create or replace function public.ensure_active_season()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  et_today date := (timezone('America/New_York', now()))::date;
  v_start date;
  v_end date;
  v_id uuid;
begin
  select id into v_id
  from public.seasons
  where start_date <= et_today
    and end_date >= et_today
  order by start_date desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  if extract(month from et_today) between 1 and 4 then
    v_start := make_date(extract(year from et_today)::int, 1, 1);
    v_end := make_date(extract(year from et_today)::int, 4, 30);
  elsif extract(month from et_today) between 5 and 8 then
    v_start := make_date(extract(year from et_today)::int, 5, 1);
    v_end := make_date(extract(year from et_today)::int, 8, 31);
  else
    v_start := make_date(extract(year from et_today)::int, 9, 1);
    v_end := make_date(extract(year from et_today)::int, 12, 31);
  end if;

  insert into public.seasons (start_date, end_date)
  values (v_start, v_end)
  on conflict (start_date, end_date) do update
    set start_date = excluded.start_date
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.is_pool_member(p_pool_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Profile bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1), 'Athlete')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Workout points + late-log rejection
-- ---------------------------------------------------------------------------

create or replace function public.set_workout_points_and_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  select * into m from public.matchups where id = new.matchup_id;

  if m is null then
    raise exception 'Matchup not found';
  end if;

  if not m.is_active then
    raise exception 'Matchup is not active';
  end if;

  if now() > m.week_end then
    raise exception 'Late log rejected: past Sunday 11:59 PM ET cutoff';
  end if;

  if new.user_id <> m.user_a_id and new.user_id <> m.user_b_id then
    raise exception 'User is not part of this matchup';
  end if;

  if new.sets is null or new.sets <= 0 then
    raise exception 'Workout must contain at least one set';
  end if;

  if new.reps_per_set is not null then
    if new.reps_per_set <= 0 then
      raise exception 'Reps per set must be a positive whole number';
    end if;
    new.reps := new.sets * new.reps_per_set;
  elsif new.reps is null or new.reps <= 0 then
    raise exception 'Total reps must be a positive whole number';
  end if;

  new.points := new.reps * 5;
  return new;
end;
$$;

drop trigger if exists trg_workouts_points on public.workouts;
create trigger trg_workouts_points
  before insert on public.workouts
  for each row execute function public.set_workout_points_and_validate();

create or replace function public.submit_workout_session(
  p_matchup_id uuid,
  p_weight_unit text,
  p_exercises jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  matchup_row public.matchups%rowtype;
  session_uuid uuid;
  workout_uuid uuid;
  exercise_data jsonb;
  set_data jsonb;
  exercise_name text;
  weight_text text;
  reps_text text;
  set_count integer;
  total_reps integer;
  set_index integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into matchup_row
  from public.matchups
  where id = p_matchup_id;

  if matchup_row.id is null then
    raise exception 'Matchup not found';
  end if;

  if not matchup_row.is_active then
    raise exception 'Matchup is not active';
  end if;

  if now() > matchup_row.week_end then
    raise exception 'Late log rejected: past Sunday 11:59 PM ET cutoff';
  end if;

  if uid <> matchup_row.user_a_id and uid <> matchup_row.user_b_id then
    raise exception 'User is not part of this matchup';
  end if;

  if p_weight_unit is null or lower(p_weight_unit) not in ('lb', 'kg') then
    raise exception 'Weight unit must be lb or kg';
  end if;

  if p_exercises is null
    or jsonb_typeof(p_exercises) <> 'array'
    or jsonb_array_length(p_exercises) = 0 then
    raise exception 'Workout must contain at least one exercise';
  end if;

  insert into public.workout_sessions (user_id, matchup_id, weight_unit)
  values (uid, p_matchup_id, lower(p_weight_unit))
  returning id into session_uuid;

  for exercise_data in
    select value from jsonb_array_elements(p_exercises)
  loop
    exercise_name := trim(exercise_data->>'name');

    if exercise_name is null or exercise_name = '' then
      raise exception 'Every exercise requires a name';
    end if;

    if exercise_data->'sets' is null
      or jsonb_typeof(exercise_data->'sets') <> 'array'
      or jsonb_array_length(exercise_data->'sets') = 0 then
      raise exception 'Every exercise requires at least one set';
    end if;

    set_count := 0;
    total_reps := 0;

    for set_data in
      select value from jsonb_array_elements(exercise_data->'sets')
    loop
      weight_text := set_data->>'weight';
      reps_text := set_data->>'reps';

      if weight_text is null
        or weight_text !~ '^[0-9]+(\.[0-9]+)?$' then
        raise exception 'Set weight must be zero or a positive number';
      end if;

      if reps_text is null
        or reps_text !~ '^[1-9][0-9]*$' then
        raise exception 'Set reps must be a positive whole number';
      end if;

      set_count := set_count + 1;
      total_reps := total_reps + reps_text::integer;
    end loop;

    insert into public.workouts (
      session_id,
      user_id,
      matchup_id,
      exercise_name,
      sets,
      reps_per_set,
      reps,
      points
    )
    values (
      session_uuid,
      uid,
      p_matchup_id,
      exercise_name,
      set_count,
      null,
      total_reps,
      total_reps * 5
    )
    returning id into workout_uuid;

    set_index := 0;
    for set_data in
      select value from jsonb_array_elements(exercise_data->'sets')
    loop
      set_index := set_index + 1;
      insert into public.workout_sets (workout_id, set_number, weight, reps)
      values (
        workout_uuid,
        set_index,
        (set_data->>'weight')::numeric,
        (set_data->>'reps')::integer
      );
    end loop;
  end loop;

  return session_uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Round-robin matchup generation
-- ---------------------------------------------------------------------------

create or replace function public.generate_matchups_for_pool(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  members uuid[];
  n int;
  i int;
  j int;
  a uuid;
  b uuid;
  pair_key text;
  used text[] := '{}';
  assigned uuid[] := '{}';
  bounds record;
  season_uuid uuid;
  remaining int;
begin
  select array_agg(user_id order by joined_at, user_id)
  into members
  from public.pool_members
  where pool_id = p_pool_id;

  n := coalesce(array_length(members, 1), 0);
  if n < 2 or n % 2 <> 0 then
    raise exception 'Pool must have an even number of members (at least 2)';
  end if;

  select season_id into season_uuid from public.pools where id = p_pool_id;

  select array_agg(least(user_a_id::text, user_b_id::text) || ':' || greatest(user_a_id::text, user_b_id::text))
  into used
  from public.matchups m
  join public.pools p on p.id = m.pool_id
  where p.season_id = season_uuid
    and m.pool_id = p_pool_id;

  used := coalesce(used, '{}');

  select * into bounds from public.current_week_bounds_et();

  -- Prefer unused pairings; if exhausted, reset pairing history for new cycle
  remaining := n / 2;

  -- Pass 1: unused pairs
  for i in 1..n loop
    a := members[i];
    if a = any(assigned) then
      continue;
    end if;

    for j in i + 1..n loop
      b := members[j];
      if b = any(assigned) then
        continue;
      end if;

      pair_key := least(a::text, b::text) || ':' || greatest(a::text, b::text);
      if pair_key = any(used) then
        continue;
      end if;

      insert into public.matchups (pool_id, user_a_id, user_b_id, week_start, week_end, is_active)
      values (p_pool_id, a, b, bounds.week_start, bounds.week_end, true);

      assigned := assigned || a || b;
      remaining := remaining - 1;
      exit;
    end loop;
  end loop;

  -- Pass 2: if incomplete, allow rematches (new cycle)
  if remaining > 0 then
    for i in 1..n loop
      a := members[i];
      if a = any(assigned) then
        continue;
      end if;

      for j in i + 1..n loop
        b := members[j];
        if b = any(assigned) then
          continue;
        end if;

        insert into public.matchups (pool_id, user_a_id, user_b_id, week_start, week_end, is_active)
        values (p_pool_id, a, b, bounds.week_start, bounds.week_end, true);

        assigned := assigned || a || b;
        remaining := remaining - 1;
        exit;
      end loop;
    end loop;
  end if;

  if remaining > 0 then
    raise exception 'Failed to generate complete matchup set';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- App RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_pool()
returns table (pool_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season uuid;
  v_code text;
  v_pool uuid;
  attempts int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_season := public.ensure_active_season();

  loop
    v_code := public.generate_invite_code();
    begin
      insert into public.pools (season_id, invite_code, created_by)
      values (v_season, v_code, auth.uid())
      returning id into v_pool;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 10 then
        raise;
      end if;
    end;
  end loop;

  insert into public.pool_members (pool_id, user_id)
  values (v_pool, auth.uid());

  return query select v_pool, v_code;
end;
$$;

create or replace function public.join_pool(p_invite_code text)
returns table (pool_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool public.pools%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pool
  from public.pools
  where invite_code = upper(trim(p_invite_code));

  if v_pool.id is null then
    raise exception 'Invalid invite code';
  end if;

  if v_pool.is_active then
    raise exception 'Bracket already started; cannot join';
  end if;

  insert into public.pool_members (pool_id, user_id)
  values (v_pool.id, auth.uid())
  on conflict do nothing;

  return query select v_pool.id;
end;
$$;

create or replace function public.start_pool_bracket(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool public.pools%rowtype;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pool from public.pools where id = p_pool_id;
  if v_pool.id is null then
    raise exception 'Pool not found';
  end if;

  if v_pool.created_by <> auth.uid() then
    raise exception 'Only the pool creator can start the bracket';
  end if;

  if v_pool.is_active then
    raise exception 'Bracket already started';
  end if;

  select count(*) into v_count from public.pool_members where pool_id = p_pool_id;
  if v_count < 2 or v_count % 2 <> 0 then
    raise exception 'Need an even number of participants to start';
  end if;

  perform public.ensure_active_season();
  perform public.generate_matchups_for_pool(p_pool_id);

  update public.pools set is_active = true where id = p_pool_id;
end;
$$;

create or replace function public.get_active_matchup()
returns table (
  matchup_id uuid,
  pool_id uuid,
  opponent_id uuid,
  opponent_name text,
  week_start timestamptz,
  week_end timestamptz,
  my_points bigint,
  opponent_points bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    m.id as matchup_id,
    m.pool_id,
    case when m.user_a_id = uid then m.user_b_id else m.user_a_id end as opponent_id,
    coalesce(p.display_name, 'Opponent') as opponent_name,
    m.week_start,
    m.week_end,
    coalesce((
      select sum(w.points)::bigint from public.workouts w
      where w.matchup_id = m.id and w.user_id = uid
    ), 0) as my_points,
    coalesce((
      select sum(w.points)::bigint from public.workouts w
      where w.matchup_id = m.id
        and w.user_id = case when m.user_a_id = uid then m.user_b_id else m.user_a_id end
    ), 0) as opponent_points
  from public.matchups m
  left join public.profiles p
    on p.id = case when m.user_a_id = uid then m.user_b_id else m.user_a_id end
  where m.is_active = true
    and (m.user_a_id = uid or m.user_b_id = uid)
  order by m.week_start desc
  limit 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly finalize (callable by service role / edge function)
-- ---------------------------------------------------------------------------

create or replace function public.finalize_week()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  pool record;
  member_count int;
  processed int := 0;
  generated int := 0;
  skipped int := 0;
begin
  -- Roll weekly points into season totals for currently active matchups
  for r in
    select m.id, m.pool_id, m.user_a_id, m.user_b_id
    from public.matchups m
    where m.is_active = true
  loop
    update public.pool_members pm
    set total_points = total_points + coalesce((
      select sum(w.points) from public.workouts w
      where w.matchup_id = r.id and w.user_id = pm.user_id
    ), 0)
    where pm.pool_id = r.pool_id
      and pm.user_id in (r.user_a_id, r.user_b_id);

    update public.matchups set is_active = false where id = r.id;
    processed := processed + 1;
  end loop;

  -- Generate next week for each active pool with even membership
  for pool in
    select * from public.pools where is_active = true
  loop
    select count(*) into member_count
    from public.pool_members
    where pool_id = pool.id;

    if member_count >= 2 and member_count % 2 = 0 then
      perform public.generate_matchups_for_pool(pool.id);
      generated := generated + 1;
    else
      skipped := skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'matchups_closed', processed,
    'pools_generated', generated,
    'pools_skipped', skipped
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Season rollover
-- ---------------------------------------------------------------------------

create or replace function public.rollover_season()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  et_today date := (timezone('America/New_York', now()))::date;
  new_id uuid;
  deactivated int;
begin
  -- Close pools whose season has ended
  update public.pools p
  set is_active = false
  from public.seasons s
  where p.season_id = s.id
    and s.end_date < et_today
    and p.is_active = true;

  get diagnostics deactivated = row_count;

  new_id := public.ensure_active_season();

  return jsonb_build_object(
    'active_season_id', new_id,
    'pools_deactivated', deactivated
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.matchups enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;

-- Profiles
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Seasons
drop policy if exists "seasons_select_authenticated" on public.seasons;
create policy "seasons_select_authenticated"
  on public.seasons for select to authenticated
  using (true);

-- Pools
drop policy if exists "pools_select_member_or_creator" on public.pools;
create policy "pools_select_member_or_creator"
  on public.pools for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_pool_member(id)
  );

drop policy if exists "pools_insert_authenticated" on public.pools;
create policy "pools_insert_authenticated"
  on public.pools for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "pools_update_creator" on public.pools;
create policy "pools_update_creator"
  on public.pools for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Pool members
drop policy if exists "pool_members_select_same_pool" on public.pool_members;
create policy "pool_members_select_same_pool"
  on public.pool_members for select to authenticated
  using (public.is_pool_member(pool_id) or user_id = auth.uid());

drop policy if exists "pool_members_insert_self" on public.pool_members;
create policy "pool_members_insert_self"
  on public.pool_members for insert to authenticated
  with check (user_id = auth.uid());

-- Matchups
drop policy if exists "matchups_select_pool_members" on public.matchups;
create policy "matchups_select_pool_members"
  on public.matchups for select to authenticated
  using (public.is_pool_member(pool_id));

-- Workouts
drop policy if exists "workouts_select_pool_members" on public.workouts;
create policy "workouts_select_pool_members"
  on public.workouts for select to authenticated
  using (
    exists (
      select 1 from public.matchups m
      where m.id = workouts.matchup_id
        and public.is_pool_member(m.pool_id)
    )
  );

drop policy if exists "workouts_insert_own_active" on public.workouts;
create policy "workouts_insert_own_active"
  on public.workouts for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matchups m
      where m.id = matchup_id
        and m.is_active = true
        and now() <= m.week_end
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

drop policy if exists "workout_sessions_select_pool_members" on public.workout_sessions;
create policy "workout_sessions_select_pool_members"
  on public.workout_sessions for select to authenticated
  using (
    exists (
      select 1
      from public.matchups m
      where m.id = workout_sessions.matchup_id
        and public.is_pool_member(m.pool_id)
    )
  );

drop policy if exists "workout_sets_select_pool_members" on public.workout_sets;
create policy "workout_sets_select_pool_members"
  on public.workout_sets for select to authenticated
  using (
    exists (
      select 1
      from public.workouts w
      join public.matchups m on m.id = w.matchup_id
      where w.id = workout_sets.workout_id
        and public.is_pool_member(m.pool_id)
    )
  );

-- Realtime for workouts (ignore if already added)
do $$
begin
  alter publication supabase_realtime add table public.workouts;
exception
  when duplicate_object then null;
end $$;

-- Seed current season immediately
select public.ensure_active_season();

-- Grants
grant usage on schema public to authenticated;
grant select on public.profiles, public.seasons, public.pools, public.pool_members, public.matchups, public.workout_sessions, public.workouts, public.workout_sets to authenticated;
grant insert on public.pools, public.pool_members, public.workouts to authenticated;
grant update on public.profiles, public.pools to authenticated;
grant execute on function public.create_pool() to authenticated;
grant execute on function public.join_pool(text) to authenticated;
grant execute on function public.start_pool_bracket(uuid) to authenticated;
grant execute on function public.get_active_matchup() to authenticated;
grant execute on function public.ensure_active_season() to authenticated;
grant execute on function public.is_display_name_available(text) to anon, authenticated;
revoke all on function public.submit_workout_session(uuid, text, jsonb) from public;
grant execute on function public.submit_workout_session(uuid, text, jsonb) to authenticated;
grant execute on function public.finalize_week() to service_role;
grant execute on function public.rollover_season() to service_role;
