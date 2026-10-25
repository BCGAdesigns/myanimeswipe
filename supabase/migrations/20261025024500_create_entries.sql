-- Swipes and ratings, one row per user and media.
-- Clients are local-first: they push rows stamped with a client clock `rev`
-- and pull by `synced_at`, a server cursor stamped on every accepted write.
create table public.entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_id text not null check (char_length(media_id) <= 64),
  status text not null check (status in ('want', 'reject', 'skip', 'seen')),
  rating smallint check (rating between 0 and 10),
  suggested_rating smallint check (suggested_rating between 0 and 10),
  queued_at bigint,
  skipped_at bigint,
  via text not null check (via in ('discover', 'recs')),
  updated_at bigint not null,
  rev bigint not null,
  -- Tombstone: the record was removed on some device.
  deleted boolean not null default false,
  -- Snapshot of the card (title, cover...) so other devices can render it.
  media jsonb check (media is null or octet_length(media::text) <= 16384),
  synced_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

create index entries_user_synced_at_idx on public.entries (user_id, synced_at);

alter table public.entries enable row level security;

grant select, insert, update, delete on table public.entries to authenticated;

create policy "Users can read their own entries"
  on public.entries for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own entries"
  on public.entries for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own entries"
  on public.entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own entries"
  on public.entries for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Last write wins per row: a stale update (older rev) is dropped, and every
-- accepted write moves the row forward in the pull cursor.
create function public.entries_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.rev < old.rev then
    return null;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

create trigger entries_before_write
  before insert or update on public.entries
  for each row execute function public.entries_before_write();
