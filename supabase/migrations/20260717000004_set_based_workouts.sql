-- Group exercises into workout sessions and store variable weight/reps per set.

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  matchup_id uuid not null references public.matchups (id) on delete cascade,
  weight_unit text not null check (weight_unit in ('lb', 'kg')),
  created_at timestamptz not null default now()
);

alter table public.workouts
  add column if not exists session_id uuid references public.workout_sessions (id) on delete cascade;

alter table public.workouts
  alter column reps_per_set drop not null;

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  set_number integer not null check (set_number > 0),
  weight numeric(10, 2) not null check (weight >= 0),
  reps integer not null check (reps > 0),
  created_at timestamptz not null default now(),
  unique (workout_id, set_number)
);

create index if not exists idx_workout_sessions_matchup
  on public.workout_sessions (matchup_id);
create index if not exists idx_workout_sessions_user
  on public.workout_sessions (user_id);
create index if not exists idx_workouts_session
  on public.workouts (session_id);
create index if not exists idx_workout_sets_workout
  on public.workout_sets (workout_id, set_number);

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

alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;

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

grant select on public.workout_sessions, public.workout_sets to authenticated;
revoke all on function public.submit_workout_session(uuid, text, jsonb) from public;
grant execute on function public.submit_workout_session(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
