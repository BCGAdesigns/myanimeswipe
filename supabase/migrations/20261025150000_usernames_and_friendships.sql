-- Friends by @username with mutual visibility, replacing one-way friend codes:
-- A asks B, B accepts, and from then on both can read each other's lists.

-- One-way codes stop working; the table stays until a cleanup migration.
revoke execute on function public.shared_list(text) from anon, authenticated;
comment on table public.shares is 'Deprecated one-way friend codes, replaced by usernames and friendships.';

create table public.usernames (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create unique index usernames_username_key on public.usernames (username);

alter table public.usernames enable row level security;

grant select, insert, update, delete on table public.usernames to authenticated;

create policy "Users manage their own username"
  on public.usernames for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- One row per pair, whoever asked first.
create unique index friendships_pair_key
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;

-- Rows are read here and changed only through the functions below.
grant select on table public.friendships to authenticated;

create policy "Users see their own friendships"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- People whose username starts with the query (3 or more of the allowed characters).
create function public.find_users(query text)
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select lower(btrim(btrim(query), '@')) as v)
  select u.user_id, u.username, u.display_name
  from public.usernames u, q
  where q.v ~ '^[a-z0-9_.]{3,20}$'
    and u.username like replace(q.v, '_', '\_') || '%'
    and u.user_id <> (select auth.uid())
  order by u.username = q.v desc, u.username
  limit 10
$$;

-- Sends a request, or accepts theirs when they already asked. Returns 'requested' or 'friends'.
create function public.request_friend(target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  existing public.friendships;
begin
  if me is null or target is null or target = me then
    raise exception 'invalid friend';
  end if;
  if not exists (select 1 from public.usernames where user_id = me) then
    raise exception 'choose a username first';
  end if;
  if not exists (select 1 from public.usernames where user_id = target) then
    raise exception 'unknown user';
  end if;
  select * into existing from public.friendships
  where (requester = me and addressee = target) or (requester = target and addressee = me);
  if found then
    if existing.status = 'accepted' then
      return 'friends';
    end if;
    if existing.requester = target then
      update public.friendships set status = 'accepted', accepted_at = now()
      where requester = target and addressee = me;
      return 'friends';
    end if;
    return 'requested';
  end if;
  insert into public.friendships (requester, addressee) values (me, target);
  return 'requested';
end;
$$;

-- Accepts or declines a request someone sent to the caller.
create function public.respond_friend(requester_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if accept then
    update public.friendships set status = 'accepted', accepted_at = now()
    where requester = requester_id and addressee = (select auth.uid()) and status = 'pending';
  else
    delete from public.friendships
    where requester = requester_id and addressee = (select auth.uid()) and status = 'pending';
  end if;
end;
$$;

-- Ends a friendship or cancels a request, from either side.
create function public.remove_friend(other uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships
  where (requester = (select auth.uid()) and addressee = other)
     or (requester = other and addressee = (select auth.uid()))
$$;

-- The caller's friends and requests: state is 'friend', 'incoming' or 'outgoing'.
create function public.my_friends()
returns table (user_id uuid, username text, display_name text, state text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.user_id, u.username, u.display_name,
    case
      when f.status = 'accepted' then 'friend'
      when f.requester = (select auth.uid()) then 'outgoing'
      else 'incoming'
    end,
    coalesce(f.accepted_at, f.created_at)
  from public.friendships f
  join public.usernames u
    on u.user_id = case when f.requester = (select auth.uid()) then f.addressee else f.requester end
  where (select auth.uid()) in (f.requester, f.addressee)
  order by 4, 2
$$;

-- A friend's list, only while the friendship is accepted; null otherwise. Skipped cards and
-- removals stay private, and card snapshots drop the synopsis and tags.
create function public.friend_list(friend uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = (select auth.uid()) and f.addressee = friend)
        or (f.requester = friend and f.addressee = (select auth.uid())))
  ) then jsonb_build_object(
    'name', (select coalesce(u.display_name, u.username) from public.usernames u where u.user_id = friend),
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
      where e.user_id = friend and not e.deleted and e.status <> 'skip'
    ), '[]'::jsonb)
  ) end
$$;

revoke all on function public.find_users(text) from public, anon;
revoke all on function public.request_friend(uuid) from public, anon;
revoke all on function public.respond_friend(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.my_friends() from public, anon;
revoke all on function public.friend_list(uuid) from public, anon;
grant execute on function public.find_users(text) to authenticated;
grant execute on function public.request_friend(uuid) to authenticated;
grant execute on function public.respond_friend(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.friend_list(uuid) to authenticated;
