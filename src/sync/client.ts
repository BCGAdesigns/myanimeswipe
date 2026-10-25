import type { SupabaseClient } from '@supabase/supabase-js'
import type { Preferences } from '../prefs'
import type { RemoteApi, RemoteRow } from './engine'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Builds without the env vars (local dev, CI) run local-only. */
export const cloudConfigured = Boolean(url && key)

let clientPromise: Promise<SupabaseClient> | null = null

/** Loaded on demand so the first swipe never waits for the Supabase bundle. */
export function getClient(): Promise<SupabaseClient> | null {
  if (!url || !key) return null
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, key, {
      // Implicit flow: the magic link carries the session in the URL hash, so it still works
      // when the email opens in another browser context than the one that asked for it.
      auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  )
  return clientPromise
}

export function supabaseRemote(client: SupabaseClient): RemoteApi {
  return {
    async push(rows) {
      const { error } = await client.from('entries').upsert(rows, { onConflict: 'user_id,media_id' })
      if (error) throw new Error(error.message)
    },
    async pull(userId, since, limit) {
      let query = client.from('entries').select('*').eq('user_id', userId)
      if (since) query = query.gt('synced_at', since)
      const { data, error } = await query.order('synced_at', { ascending: true }).limit(limit)
      if (error) throw new Error(error.message)
      return (data ?? []) as RemoteRow[]
    },
  }
}

/** The user's preferences row (`public.profiles`), last write wins on `updated_at`. */
export interface ProfilesApi {
  get(userId: string): Promise<{ preferences: unknown; updated_at: number } | null>
  put(userId: string, prefs: Preferences): Promise<void>
}

export function supabaseProfiles(client: SupabaseClient): ProfilesApi {
  return {
    async get(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('preferences, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    async put(userId, prefs) {
      const { error } = await client
        .from('profiles')
        .upsert({ user_id: userId, preferences: prefs, updated_at: prefs.updatedAt }, { onConflict: 'user_id' })
      if (error) throw new Error(error.message)
    },
  }
}
