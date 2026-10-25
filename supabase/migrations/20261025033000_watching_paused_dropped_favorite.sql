-- MyAnimeList-style statuses (watching, on hold, dropped) and a favorite flag.
alter table public.entries drop constraint entries_status_check;
alter table public.entries add constraint entries_status_check
  check (status in ('want', 'reject', 'skip', 'seen', 'watching', 'paused', 'dropped'));

alter table public.entries add column favorite boolean not null default false;
