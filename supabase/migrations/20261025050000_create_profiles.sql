-- One row per user with their preferences (what to classify and discovery filters).
-- `updated_at` is the client clock of the last change; the newest copy wins.
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  preferences jsonb not null check (octet_length(preferences::text) <= 8192),
  updated_at bigint not null,
  synced_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select, insert, update on table public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A stale write (older client clock) is dropped instead of overwriting newer preferences.
create function public.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();
