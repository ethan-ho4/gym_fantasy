-- Store workout structure while preserving total reps for score aggregation.

alter table public.workouts
  add column if not exists sets integer,
  add column if not exists reps_per_set integer;

update public.workouts
set
  sets = coalesce(sets, 1),
  reps_per_set = coalesce(reps_per_set, reps)
where sets is null or reps_per_set is null;

alter table public.workouts
  alter column sets set not null,
  alter column reps_per_set set not null;

alter table public.workouts
  drop constraint if exists workouts_sets_positive,
  drop constraint if exists workouts_reps_per_set_positive;

alter table public.workouts
  add constraint workouts_sets_positive check (sets > 0),
  add constraint workouts_reps_per_set_positive check (reps_per_set > 0);

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

  if new.sets is null or new.sets <= 0
    or new.reps_per_set is null or new.reps_per_set <= 0 then
    raise exception 'Sets and reps per set must be positive whole numbers';
  end if;

  new.reps := new.sets * new.reps_per_set;
  new.points := new.reps * 5;
  return new;
end;
$$;
