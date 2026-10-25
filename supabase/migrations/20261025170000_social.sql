-- Social layer: profile card (avatar, bio, invite code), invite codes that make friends at
-- once, friends' activity feed with likes, recommendations sent on purpose, and taste tests.
-- Everything a friend sees goes through security definer functions that check an accepted
-- friendship first; tables only expose rows to the people they belong to.

-- 10 characters without look-alikes (no i, l, o, 0, 1), same alphabet as the old share codes.
-- Security definer so the column default works for any signed-in user inserting their row.
create function public.new_invite_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (get_byte(r.b, i) % 31) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(10) as b) r, generate_series(0, 9) i
$$;

alter table public.usernames
  add column bio text check (bio is null or char_length(bio) <= 160),
  add column avatar text check (avatar is null or char_length(avatar) <= 16),
  add column invite_code text not null default public.new_invite_code() check (invite_code ~ '^[a-z0-9]{10}$');

create unique index usernames_invite_code_key on public.usernames (invite_code);

create index entries_user_updated_idx on public.entries (user_id, updated_at desc);

-- True when the caller and `other` are accepted friends.
create function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = (select auth.uid()) and f.addressee = other)
        or (f.requester = other and f.addressee = (select auth.uid())))
  )
$$;

-- Search by username prefix, with the avatar for the result list.
create function public.people_search(query text)
returns table (user_id uuid, username text, display_name text, avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select lower(btrim(btrim(query), '@')) as v)
  select u.user_id, u.username, u.display_name, u.avatar
  from public.usernames u, q
  where q.v ~ '^[a-z0-9_.]{3,20}$'
    and u.username like replace(q.v, '_', '\_') || '%'
    and u.user_id <> (select auth.uid())
  order by u.username = q.v desc, u.username
  limit 10
$$;

-- Friends and requests with their profile card; state is 'friend', 'incoming' or 'outgoing'.
create function public.friends_overview()
returns table (user_id uuid, username text, display_name text, avatar text, bio text, state text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.user_id, u.username, u.display_name, u.avatar, u.bio,
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
  order by 6, 2
$$;

-- An invite code was handed over on purpose, so using it makes both people friends at once.
create function public.add_by_invite(code text)
returns table (user_id uuid, username text, display_name text, avatar text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
begin
  if me is null then
    raise exception 'sign in first';
  end if;
  if not exists (select 1 from public.usernames where usernames.user_id = me) then
    raise exception 'choose a username first';
  end if;
  select u.user_id into target from public.usernames u where u.invite_code = lower(btrim(code));
  if target is null then
    raise exception 'unknown invite';
  end if;
  if target = me then
    raise exception 'own invite';
  end if;
  insert into public.friendships (requester, addressee, status, accepted_at)
  values (target, me, 'accepted', now())
  on conflict do nothing;
  update public.friendships set status = 'accepted', accepted_at = coalesce(accepted_at, now())
  where (requester = me and addressee = target) or (requester = target and addressee = me);
  return query
    select u.user_id, u.username, u.display_name, u.avatar from public.usernames u where u.user_id = target;
end;
$$;

-- A new invite code; the old one stops working.
create function public.regenerate_invite_code()
returns text
language sql
security definer
set search_path = ''
as $$
  update public.usernames set invite_code = public.new_invite_code()
  where user_id = (select auth.uid())
  returning invite_code
$$;

-- A friend's profile and whole list (with when each record last changed), or null.
create function public.friend_profile(friend uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_friend(friend) then (
    select jsonb_build_object(
      'userId', u.user_id,
      'username', u.username,
      'displayName', u.display_name,
      'avatar', u.avatar,
      'bio', u.bio,
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'mediaId', e.media_id,
          'status', e.status,
          'rating', e.rating,
          'suggestedRating', e.suggested_rating,
          'favorite', e.favorite,
          'updatedAt', e.updated_at,
          'media', e.media - 'synopsis' - 'tags'
        ))
        from public.entries e
        where e.user_id = friend and not e.deleted and e.status <> 'skip'
      ), '[]'::jsonb)
    )
    from public.usernames u where u.user_id = friend
  ) end
$$;

-- Likes on a friend's activity (one per person, title and friend).
create table public.reactions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_user uuid not null references auth.users (id) on delete cascade,
  media_id text not null check (char_length(media_id) <= 64),
  created_at timestamptz not null default now(),
  primary key (user_id, target_user, media_id),
  check (user_id <> target_user)
);

create index reactions_target_idx on public.reactions (target_user, media_id);

alter table public.reactions enable row level security;

grant select on table public.reactions to authenticated;

create policy "Users see likes they gave or got"
  on public.reactions for select to authenticated
  using ((select auth.uid()) in (user_id, target_user));

-- Likes or unlikes a friend's activity on a title; returns whether it is liked now.
create function public.toggle_like(target uuid, media text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_friend(target) then
    raise exception 'not friends';
  end if;
  delete from public.reactions where user_id = (select auth.uid()) and target_user = target and media_id = media;
  if found then
    return false;
  end if;
  insert into public.reactions (user_id, target_user, media_id) values ((select auth.uid()), target, media);
  return true;
end;
$$;

-- Friends' recent activity, newest first (skips, "not interested" and removals stay private).
create function public.friends_feed(before_ms bigint default null, max_items int default 40)
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
    select e.*
    from public.entries e
    join friends fr on fr.id = e.user_id
    where not e.deleted and e.status not in ('skip', 'reject')
      and (before_ms is null or e.updated_at < before_ms)
    order by e.updated_at desc
    limit least(greatest(max_items, 1), 100)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', r.user_id,
    'username', u.username,
    'displayName', u.display_name,
    'avatar', u.avatar,
    'mediaId', r.media_id,
    'status', r.status,
    'rating', r.rating,
    'suggestedRating', r.suggested_rating,
    'favorite', r.favorite,
    'updatedAt', r.updated_at,
    'media', r.media - 'synopsis' - 'tags',
    'likes', (select count(*) from public.reactions x where x.target_user = r.user_id and x.media_id = r.media_id),
    'liked', exists (
      select 1 from public.reactions x
      where x.user_id = (select auth.uid()) and x.target_user = r.user_id and x.media_id = r.media_id
    )
  ) order by r.updated_at desc), '[]'::jsonb)
  from recent r
  join public.usernames u on u.user_id = r.user_id
$$;

-- Who liked the caller's activity, newest first.
create function public.likes_received(max_items int default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb) from (
    select x.created_at, jsonb_build_object(
      'userId', x.user_id,
      'username', u.username,
      'displayName', u.display_name,
      'avatar', u.avatar,
      'mediaId', x.media_id,
      'media', e.media - 'synopsis' - 'tags',
      'createdAt', x.created_at
    ) as item
    from public.reactions x
    join public.usernames u on u.user_id = x.user_id
    left join public.entries e on e.user_id = x.target_user and e.media_id = x.media_id
    where x.target_user = (select auth.uid())
    order by x.created_at desc
    limit least(greatest(max_items, 1), 100)
  ) t
$$;

-- Titles one friend recommends to another, on purpose.
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  media_id text not null check (char_length(media_id) <= 64),
  media jsonb not null check (octet_length(media::text) <= 16384),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  liked_at timestamptz,
  dismissed_at timestamptz,
  unique (from_user, to_user, media_id),
  check (from_user <> to_user)
);

create index recommendations_to_idx on public.recommendations (to_user, created_at desc);

alter table public.recommendations enable row level security;

grant select on table public.recommendations to authenticated;

create policy "Users see recommendations they sent or got"
  on public.recommendations for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));

-- Sends (or re-sends, bumping it up) a recommendation to a friend.
create function public.recommend(to_friend uuid, media_key text, media_snapshot jsonb, note_text text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec_id uuid;
begin
  if not public.is_friend(to_friend) then
    raise exception 'not friends';
  end if;
  insert into public.recommendations (from_user, to_user, media_id, media, note)
  values ((select auth.uid()), to_friend, media_key, media_snapshot - 'synopsis' - 'tags', nullif(btrim(note_text), ''))
  on conflict (from_user, to_user, media_id) do update
    set note = excluded.note, media = excluded.media, created_at = now(), seen_at = null, dismissed_at = null
  returning id into rec_id;
  return rec_id;
end;
$$;

-- The receiver marks recommendations as seen, likes them, or dismisses them.
create function public.update_recommendation(rec uuid, mark_seen boolean default false, liked boolean default null, dismiss boolean default false)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.recommendations set
    seen_at = case when mark_seen and seen_at is null then now() else seen_at end,
    liked_at = case when liked is null then liked_at when liked then coalesce(liked_at, now()) else null end,
    dismissed_at = case when dismiss then now() else dismissed_at end
  where id = rec and to_user = (select auth.uid())
$$;

-- The sender takes a recommendation back.
create function public.unsend_recommendation(rec uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.recommendations where id = rec and from_user = (select auth.uid())
$$;

-- Recommendations the caller got (not dismissed), newest first.
create function public.received_recommendations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'userId', r.from_user,
    'username', u.username,
    'displayName', u.display_name,
    'avatar', u.avatar,
    'mediaId', r.media_id,
    'media', r.media,
    'note', r.note,
    'createdAt', r.created_at,
    'seenAt', r.seen_at,
    'likedAt', r.liked_at
  ) order by r.created_at desc), '[]'::jsonb)
  from public.recommendations r
  join public.usernames u on u.user_id = r.from_user
  where r.to_user = (select auth.uid()) and r.dismissed_at is null
$$;

-- Recommendations the caller sent, with what the friend did about each title since.
create function public.sent_recommendations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'userId', r.to_user,
    'username', u.username,
    'displayName', u.display_name,
    'avatar', u.avatar,
    'mediaId', r.media_id,
    'media', r.media,
    'note', r.note,
    'createdAt', r.created_at,
    'seenAt', r.seen_at,
    'likedAt', r.liked_at,
    'dismissed', r.dismissed_at is not null,
    'theirStatus', case when public.is_friend(r.to_user) then e.status end,
    'theirRating', case when public.is_friend(r.to_user) then coalesce(e.rating, e.suggested_rating) end,
    'theirFavorite', case when public.is_friend(r.to_user) then e.favorite end
  ) order by r.created_at desc), '[]'::jsonb)
  from public.recommendations r
  join public.usernames u on u.user_id = r.to_user
  left join public.entries e on e.user_id = r.to_user and e.media_id = r.media_id and not e.deleted
  where r.from_user = (select auth.uid())
$$;

-- Taste tests: both people answer the same titles (their opinion and a guess of the other's).
create table public.taste_tests (
  id uuid primary key default gen_random_uuid(),
  creator uuid not null default auth.uid() references auth.users (id) on delete cascade,
  partner uuid not null references auth.users (id) on delete cascade,
  items jsonb not null check (
    jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 3 and 12 and octet_length(items::text) <= 65536
  ),
  creator_answers jsonb check (creator_answers is null or octet_length(creator_answers::text) <= 16384),
  partner_answers jsonb check (partner_answers is null or octet_length(partner_answers::text) <= 16384),
  creator_done_at timestamptz,
  partner_done_at timestamptz,
  created_at timestamptz not null default now(),
  check (creator <> partner)
);

create index taste_tests_partner_idx on public.taste_tests (partner);
create index taste_tests_creator_idx on public.taste_tests (creator);

-- No direct reads: answers stay hidden from the other person until both have answered.
alter table public.taste_tests enable row level security;

create function public.create_taste_test(friend uuid, test_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  test_id uuid;
begin
  if not public.is_friend(friend) then
    raise exception 'not friends';
  end if;
  insert into public.taste_tests (creator, partner, items)
  values ((select auth.uid()), friend, test_items)
  returning id into test_id;
  return test_id;
end;
$$;

create function public.answer_taste_test(test uuid, answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(answers) <> 'object' then
    raise exception 'invalid answers';
  end if;
  -- Answers are final, so nobody changes theirs after seeing the other person's.
  update public.taste_tests set creator_answers = answers, creator_done_at = now()
  where id = test and creator = (select auth.uid()) and creator_done_at is null;
  if found then
    return;
  end if;
  update public.taste_tests set partner_answers = answers, partner_done_at = now()
  where id = test and partner = (select auth.uid()) and partner_done_at is null;
  if not found then
    raise exception 'unknown or answered test';
  end if;
end;
$$;

-- The caller's tests; the other person's answers only once both are done.
create function public.my_taste_tests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'userId', u.user_id,
    'username', u.username,
    'displayName', u.display_name,
    'avatar', u.avatar,
    'createdByMe', t.creator = (select auth.uid()),
    'items', t.items,
    'myAnswers', case when t.creator = (select auth.uid()) then t.creator_answers else t.partner_answers end,
    'theirAnswers', case
      when t.creator_done_at is not null and t.partner_done_at is not null then
        case when t.creator = (select auth.uid()) then t.partner_answers else t.creator_answers end
    end,
    'myDone', case when t.creator = (select auth.uid()) then t.creator_done_at else t.partner_done_at end is not null,
    'theirDone', case when t.creator = (select auth.uid()) then t.partner_done_at else t.creator_done_at end is not null,
    'createdAt', t.created_at
  ) order by t.created_at desc), '[]'::jsonb)
  from public.taste_tests t
  join public.usernames u on u.user_id = case when t.creator = (select auth.uid()) then t.partner else t.creator end
  where (select auth.uid()) in (t.creator, t.partner) and public.is_friend(u.user_id)
$$;

create function public.delete_taste_test(test uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.taste_tests where id = test and (select auth.uid()) in (creator, partner)
$$;

revoke all on function public.new_invite_code() from public, anon;
grant execute on function public.new_invite_code() to authenticated;
revoke all on function public.is_friend(uuid) from public, anon;
revoke all on function public.people_search(text) from public, anon;
revoke all on function public.friends_overview() from public, anon;
revoke all on function public.add_by_invite(text) from public, anon;
revoke all on function public.regenerate_invite_code() from public, anon;
revoke all on function public.friend_profile(uuid) from public, anon;
revoke all on function public.toggle_like(uuid, text) from public, anon;
revoke all on function public.friends_feed(bigint, int) from public, anon;
revoke all on function public.likes_received(int) from public, anon;
revoke all on function public.recommend(uuid, text, jsonb, text) from public, anon;
revoke all on function public.update_recommendation(uuid, boolean, boolean, boolean) from public, anon;
revoke all on function public.unsend_recommendation(uuid) from public, anon;
revoke all on function public.received_recommendations() from public, anon;
revoke all on function public.sent_recommendations() from public, anon;
revoke all on function public.create_taste_test(uuid, jsonb) from public, anon;
revoke all on function public.answer_taste_test(uuid, jsonb) from public, anon;
revoke all on function public.my_taste_tests() from public, anon;
revoke all on function public.delete_taste_test(uuid) from public, anon;

grant execute on function public.is_friend(uuid) to authenticated;
grant execute on function public.people_search(text) to authenticated;
grant execute on function public.friends_overview() to authenticated;
grant execute on function public.add_by_invite(text) to authenticated;
grant execute on function public.regenerate_invite_code() to authenticated;
grant execute on function public.friend_profile(uuid) to authenticated;
grant execute on function public.toggle_like(uuid, text) to authenticated;
grant execute on function public.friends_feed(bigint, int) to authenticated;
grant execute on function public.likes_received(int) to authenticated;
grant execute on function public.recommend(uuid, text, jsonb, text) to authenticated;
grant execute on function public.update_recommendation(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.unsend_recommendation(uuid) to authenticated;
grant execute on function public.received_recommendations() to authenticated;
grant execute on function public.sent_recommendations() to authenticated;
grant execute on function public.create_taste_test(uuid, jsonb) to authenticated;
grant execute on function public.answer_taste_test(uuid, jsonb) to authenticated;
grant execute on function public.my_taste_tests() to authenticated;
grant execute on function public.delete_taste_test(uuid) to authenticated;
