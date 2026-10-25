import { useCallback, useEffect, useRef, useState } from 'react'
import { countOutbox, idbStore } from '../db'
import { normalizePrefs, type Preferences } from '../prefs'
import { cloudConfigured, getClient, supabaseProfiles, supabaseRemote, type ProfilesApi } from './client'
import { runSync, type RemoteChange } from './engine'

export type CloudStatus = 'off' | 'loading' | 'signed-out' | 'idle' | 'syncing' | 'error'

export interface CloudState {
  status: CloudStatus
  email: string | null
  lastSyncAt: number | null
  /** Local changes not yet in the cloud. */
  pending: number
  message: string | null
}

/** Debounce for syncing after local changes, so a swipe streak becomes one push. */
const AFTER_CHANGE_MS = 3000

function friendlyError(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e)
  if (/expired or is invalid|otp_expired|invalid.*token/i.test(text)) return 'Código ou link inválido ou expirado. Peça um novo.'
  if (/rate limit|429/i.test(text)) return 'Limite de envio de e-mails atingido (o plano grátis permite 2 por hora). Tente mais tarde.'
  if (/not authorized|not allowed/i.test(text)) return 'Este e-mail não pode receber o link: o envio padrão do Supabase só atende membros da organização.'
  if (/failed to fetch|network|load failed/i.test(text)) return 'Sem conexão com o servidor. As alterações ficam guardadas e sobem quando a conexão voltar.'
  return text
}

/** Error that Supabase appends to the URL when a magic link is expired or already used. */
function linkErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1))
  if (!params.get('error_description')) return null
  return params.get('error_code') === 'otp_expired'
    ? 'O link de acesso expirou ou já foi usado. Peça outro.'
    : `Não foi possível entrar: ${params.get('error_description')}`
}

interface Options {
  onApplied: (changes: RemoteChange[]) => void
  getPrefs: () => Preferences | null
  onRemotePrefs: (prefs: Preferences) => void
}

/** Preferences are one small row: newest copy wins, whichever side it is on. */
async function syncPrefs(api: ProfilesApi, userId: string, local: Preferences | null, apply: (p: Preferences) => void) {
  const remote = await api.get(userId)
  if (remote && remote.updated_at > (local?.updatedAt ?? 0)) {
    apply(normalizePrefs({ ...(remote.preferences as object), updatedAt: remote.updated_at }))
  } else if (local && local.updatedAt > (remote?.updated_at ?? -1)) {
    await api.put(userId, local)
  }
}

export function useCloudSync(options: Options) {
  const [state, setState] = useState<CloudState>(() => ({
    status: cloudConfigured ? 'loading' : 'off',
    email: null,
    lastSyncAt: null,
    pending: 0,
    message: linkErrorFromUrl(),
  }))
  const userIdRef = useRef<string | null>(null)
  const running = useRef(false)
  const again = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const sync = useCallback(async function sync() {
    const userId = userIdRef.current
    const clientPromise = getClient()
    if (!userId || !clientPromise) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setState((s) => ({ ...s, status: 'syncing' }))
    try {
      const client = await clientPromise
      const { applied } = await runSync(idbStore, supabaseRemote(client), userId)
      if (applied.length) optionsRef.current.onApplied(applied)
      await syncPrefs(supabaseProfiles(client), userId, optionsRef.current.getPrefs(), (p) =>
        optionsRef.current.onRemotePrefs(p),
      )
      const pending = await countOutbox()
      setState((s) => ({ ...s, status: 'idle', lastSyncAt: Date.now(), pending, message: null }))
    } catch (e) {
      const pending = await countOutbox().catch(() => 0)
      setState((s) => ({ ...s, status: 'error', pending, message: friendlyError(e) }))
    } finally {
      running.current = false
      if (again.current) {
        again.current = false
        window.setTimeout(() => void sync(), 1000)
      }
    }
  }, [])

  /** Called after every local change. */
  const schedule = useCallback(
    (delay = AFTER_CHANGE_MS) => {
      if (!userIdRef.current) return
      countOutbox()
        .then((pending) => setState((s) => ({ ...s, pending })))
        .catch(() => {})
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void sync(), delay)
    },
    [sync],
  )

  useEffect(() => {
    // The error is already in state; drop it from the URL so a reload doesn't show it again.
    if (linkErrorFromUrl()) window.history.replaceState(null, '', window.location.pathname)
    const clientPromise = getClient()
    if (!clientPromise) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    clientPromise
      .then((client) => {
        if (cancelled) return
        const { data } = client.auth.onAuthStateChange((event, session) => {
          const user = session?.user ?? null
          userIdRef.current = user?.id ?? null
          setState((s) => ({
            ...s,
            email: user?.email ?? null,
            status: !user ? 'signed-out' : s.status === 'loading' || s.status === 'signed-out' ? 'idle' : s.status,
          }))
          // Supabase warns against calling its client from inside this callback; defer.
          if (user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) window.setTimeout(() => void sync(), 0)
        })
        unsubscribe = () => data.subscription.unsubscribe()
      })
      .catch((e) => setState((s) => ({ ...s, status: 'error', message: friendlyError(e) })))

    const onOnline = () => schedule(0)
    const onVisible = () => document.visibilityState === 'visible' && schedule(0)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      unsubscribe?.()
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearTimeout(timer.current)
    }
  }, [sync, schedule])

  const signIn = useCallback(async (email: string) => {
    const client = await getClient()
    if (!client) throw new Error('Sincronização não configurada nesta versão.')
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    if (error) throw new Error(friendlyError(error))
    setState((s) => ({ ...s, message: null }))
  }, [])

  /** The 6 digit code in the same e-mail: signs in inside the installed app, where the link can't reach. */
  const verifyCode = useCallback(async (email: string, code: string) => {
    const client = await getClient()
    if (!client) throw new Error('Sincronização não configurada nesta versão.')
    const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw new Error(friendlyError(error))
    setState((s) => ({ ...s, message: null }))
  }, [])

  const signOut = useCallback(async () => {
    const client = await getClient()
    await client?.auth.signOut()
  }, [])

  const syncNow = useCallback(() => schedule(0), [schedule])

  /** Deletes the account and its cloud data (edge function `delete-account`), then signs out. */
  const deleteAccount = useCallback(async () => {
    const client = await getClient()
    if (!client) throw new Error('Sincronização não configurada nesta versão.')
    const { error } = await client.functions.invoke('delete-account', { method: 'POST' })
    if (error) throw new Error(friendlyError(error))
    await client.auth.signOut()
  }, [])

  return { state, schedule, signIn, verifyCode, signOut, syncNow, deleteAccount }
}
