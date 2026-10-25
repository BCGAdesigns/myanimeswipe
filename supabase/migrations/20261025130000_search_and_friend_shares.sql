-- Titles can now also be classified from search and from a friend's list.
alter table public.entries drop constraint entries_via_check;
alter table public.entries add constraint entries_via_check check (via in ('discover', 'recs', 'search', 'friend'));

-- Friend codes: a user may opt in to let anyone holding their code read their list
-- (to compare tastes). Deleting the row stops sharing; a new row means a new code.
create table public.shares (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{10}$'),
  name text check (name is null or char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.shares enable row level security;

grant select, insert, update, delete on table public.shares to authenticated;

create policy "Users can read their own share"
  on public.shares for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own share"
  on public.shares for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can rename their own share"
  on public.shares for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can stop sharing"
  on public.shares for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The list behind a code, or null for an unknown code. Security definer on purpose:
-- holding the code is the permission. Skipped cards and removals stay private, and the
-- card snapshots drop the synopsis and tags to keep the payload small.
create function public.shared_list(share_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', s.name,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mediaId', e.media_id,
        'status', e.status,
        'rating', e.rating,
        'suggestedRating', e.suggested_rating,
        'favorite', e.favorite,
        'media', e.media - 'synopsis' - 'tags'
      ))
      from public.entries e
      where e.user_id = s.user_id and not e.deleted and e.status <> 'skip'
    ), '[]'::jsonb)
  )
  from public.shares s
  where s.code = lower(share_code)
$$;

revoke all on function public.shared_list(text) from public;
grant execute on function public.shared_list(text) to anon, authenticated;
