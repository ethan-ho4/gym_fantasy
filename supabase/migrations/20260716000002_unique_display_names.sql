-- Case-insensitive unique display names

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

grant execute on function public.is_display_name_available(text) to anon, authenticated;
