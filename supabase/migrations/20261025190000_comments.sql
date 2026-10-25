-- Comments. A conversation belongs to one person and one title: commenting on a friend's rating
-- writes in that friend's conversation, and commenting on a title in general writes in your own.
-- The owner and the owner's friends read it and write in it. Authors delete their comments, and
-- the owner can delete any comment in their own conversation. Everything goes through the
-- functions below; the table has no read or write policies.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  thread_owner uuid not null references auth.users (id) on delete cascade,
  media_id text not null check (char_length(media_id) <= 64),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  -- Card data for titles the owner has no record of (a comment without a rating).
  media jsonb check (media is null or octet_length(media::text) <= 16384),
  created_at timestamptz not null default now()
);

create index comments_thread_idx on public.comments (thread_owner, media_id, created_at);
create index comments_media_idx on public.comments (media_id, created_at desc);
create index comments_author_idx on public.comments (author, created_at desc);

alter table public.comments enable row level security;

-- The caller's own conversations and their friends' are open to them.
create function public.can_see_thread(thread_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select thread_user = (select auth.uid()) or public.is_friend(thread_user)
$$;

create function public.post_comment(thread_user uuid, media_key text, body_text text, media_snapshot jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  clean text := btrim(body_text);
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first';
  end if;
  if not exists (select 1 from public.usernames where user_id = (select auth.uid())) then
    raise exception 'choose a username first';
  end if;
  if not public.can_see_thread(thread_user) then
    raise exception 'not friends';
  end if;
  if clean is null or clean = '' then
    raise exception 'empty comment';
  end if;
  insert into public.comments (thread_owner, media_id, author, body, media)
  values (thread_user, media_key, (select auth.uid()), clean, media_snapshot - 'synopsis' - 'tags')
  returning id into new_id;
  return new_id;
end;
$$;

create function public.delete_comment(comment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.comments
  where id = comment_id and (select auth.uid()) in (author, thread_owner)
$$;

-- One conversation, oldest first; null when the caller cannot see it.
create function public.thread_comments(thread_user uuid, media_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.can_see_thread(thread_user) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'threadOwner', c.thread_owner,
      'mediaId', c.media_id,
      'userId', u.user_id,
      'username', u.username,
      'displayName', u.display_name,
      'avatar', u.avatar,
      'body', c.body,
      'createdAt', c.created_at,
      'mine', c.author = (select auth.uid())
    ) order by c.created_at)
    from public.comments c
    join public.usernames u on u.user_id = c.author
    where c.thread_owner = thread_user and c.media_id = media_key
  ), '[]'::jsonb) end
$$;

-- Everything said about one title in the conversations the caller can see, newest first.
create function public.title_comments(media_key text, max_items int default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select (select auth.uid()) as id
    union
    select case when f.requester = (select auth.uid()) then f.addressee else f.requester end
    from public.friendships f
    where f.status = 'accepted' and (select auth.uid()) in (f.requester, f.addressee)
  )
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb) from (
    select c.created_at, jsonb_build_object(
      'id', c.id,
      'threadOwner', c.thread_owner,
      'ownerUsername', o.username,
      'ownerDisplayName', o.display_name,
      'mediaId', c.media_id,
      'userId', u.user_id,
      'username', u.username,
      'displayName', u.display_name,
      'avatar', u.avatar,
      'body', c.body,
      'createdAt', c.created_at,
      'mine', c.author = (select auth.uid())
    ) as item
    from public.comments c
    join visible v on v.id = c.thread_owner
    join public.usernames u on u.user_id = c.author
    join public.usernames o on o.user_id = c.thread_owner
    where c.media_id = media_key
    order by c.created_at desc
    limit least(greatest(max_items, 1), 200)
  ) t
$$;

-- Comments for the caller: in their own conversations, and replies after theirs in other
-- conversations they can still see. Newest first.
create function public.comments_received(max_items int default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb) from (
    select c.created_at, jsonb_build_object(
      'id', c.id,
      'threadOwner', c.thread_owner,
      'ownerUsername', o.username,
      'ownerDisplayName', o.display_name,
      'mediaId', c.media_id,
      'userId', u.user_id,
      'username', u.username,
      'displayName', u.display_name,
      'avatar', u.avatar,
      'body', c.body,
      'createdAt', c.created_at,
      'mine', false,
      'media', coalesce(e.media - 'synopsis' - 'tags', c.media)
    ) as item
    from public.comments c
    join public.usernames u on u.user_id = c.author
    join public.usernames o on o.user_id = c.thread_owner
    left join public.entries e on e.user_id = c.thread_owner and e.media_id = c.media_id and not e.deleted
    where c.author <> (select auth.uid())
      and (
        c.thread_owner = (select auth.uid())
        or (
          public.is_friend(c.thread_owner)
          and exists (
            select 1 from public.comments mine
            where mine.thread_owner = c.thread_owner and mine.media_id = c.media_id
              and mine.author = (select auth.uid()) and mine.created_at < c.created_at
          )
        )
      )
    order by c.created_at desc
    limit least(greatest(max_items, 1), 100)
  ) t
$$;

-- What friends said about titles in their own conversations, newest first (the feed shows it).
create function public.friends_comments(before_ms bigint default null, max_items int default 40)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with friends as (
    select case when f.requester = (select auth.uid()) then f.addressee else f.requester end as id
    from public.friendships f
    where f.status = 'accepted' and (select auth.uid()) in (f.requester, f.addressee)
  ),
  recent as (
    select c.*
    from public.comments c
    join friends fr on fr.id = c.author
    where c.author = c.thread_owner
      and (before_ms is null or c.created_at < to_timestamp(before_ms / 1000.0))
    order by c.created_at desc
    limit least(greatest(max_items, 1), 100)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'threadOwner', r.thread_owner,
    'mediaId', r.media_id,
    'userId', u.user_id,
    'username', u.username,
    'displayName', u.display_name,
    'avatar', u.avatar,
    'body', r.body,
    'createdAt', r.created_at,
    'mine', false,
    'media', coalesce(e.media - 'synopsis' - 'tags', r.media),
    'replies', (select count(*) from public.comments x where x.thread_owner = r.thread_owner and x.media_id = r.media_id) - 1
  ) order by r.created_at desc), '[]'::jsonb)
  from recent r
  join public.usernames u on u.user_id = r.author
  left join public.entries e on e.user_id = r.thread_owner and e.media_id = r.media_id and not e.deleted
$$;

-- How many comments each listed conversation has: [{"owner": uuid, "media": text}] in,
-- {"owner|media": count} out, only for conversations the caller can see (at most 200).
create function public.comment_counts(threads jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
    select t.owner::text || '|' || t.media as k, count(c.id) as n
    from (
      select (x.value ->> 'owner')::uuid as owner, x.value ->> 'media' as media
      from jsonb_array_elements(case when jsonb_typeof(threads) = 'array' then threads else '[]'::jsonb end)
        with ordinality as x(value, n)
      where x.n <= 200
    ) t
    left join public.comments c on c.thread_owner = t.owner and c.media_id = t.media
    where public.can_see_thread(t.owner)
    group by 1
  ) counts
$$;

revoke all on function public.can_see_thread(uuid) from public, anon, authenticated;
revoke all on function public.post_comment(uuid, text, text, jsonb) from public, anon;
revoke all on function public.delete_comment(uuid) from public, anon;
revoke all on function public.thread_comments(uuid, text) from public, anon;
revoke all on function public.title_comments(text, int) from public, anon;
revoke all on function public.comments_received(int) from public, anon;
revoke all on function public.friends_comments(bigint, int) from public, anon;
revoke all on function public.comment_counts(jsonb) from public, anon;

grant execute on function public.post_comment(uuid, text, text, jsonb) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.thread_comments(uuid, text) to authenticated;
grant execute on function public.title_comments(text, int) to authenticated;
grant execute on function public.comments_received(int) to authenticated;
grant execute on function public.friends_comments(bigint, int) to authenticated;
grant execute on function public.comment_counts(jsonb) to authenticated;
