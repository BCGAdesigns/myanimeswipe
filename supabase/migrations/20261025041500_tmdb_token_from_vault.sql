-- The tmdb edge function reads its TMDB credential from Vault when no function secret is set.
-- Only the service role (used inside the edge function) may call this.
-- The secret itself is created outside version control:
--   select vault.create_secret('<TMDB read access token>', 'tmdb_read_token');
create function public.tmdb_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tmdb_read_token' limit 1
$$;

revoke all on function public.tmdb_token() from public, anon, authenticated;
grant execute on function public.tmdb_token() to service_role;
