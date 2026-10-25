import { useCallback, useEffect, useRef, useState } from 'react'
import { countOutbox, idbStore } from '../db'
import { cloudConfigured, getClient, supabaseRemote } from './client'
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

export function useCloudSync(onApplied: (changes: RemoteChange[]) => void) {
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
  const onAppliedRef = useRef(onApplied)
  onAppliedRef.current = onApplied

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
      const { applied } = await runSync(idbStore, supabaseRemote(await clientPromise), userId)
      if (applied.length) onAppliedRef.current(applied)
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

  const signOut = useCallback(async () => {
    const client = await getClient()
    await client?.auth.signOut()
  }, [])

  const syncNow = useCallback(() => schedule(0), [schedule])

  return { state, schedule, signIn, signOut, syncNow }
}
