import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { APP_NAME } from './brand'
import * as db from './db'
import { applyAction } from './logic'
import { DEFAULT_PREFS, filterHash, normalizePrefs, type Preferences } from './prefs'
import { buildRecs, type RecsCache } from './recs/engine'
import { fetchAnimeRecs } from './sources/anilist'
import {
  catalogFor,
  describeSourceError,
  fetchSourcePage,
  type Catalogs,
  type SourceKey,
} from './sources/catalog'
import { fetchTmdbRecs } from './sources/tmdb'
import { revOf, type RemoteChange } from './sync/engine'
import { useCloudSync, type CloudState } from './sync/useCloudSync'
import type { Entry, Media, SwipeAction } from './types'

interface UndoStep {
  mediaId: string
  prev: Entry | undefined
}

export interface ExportFile {
  app: 'myanimeswipe'
  version: 1
  exportedAt: string
  entries: Entry[]
  media: Media[]
  prefs?: Preferences
}

export type RecsStatus = 'idle' | 'building' | 'error'

interface Store {
  ready: boolean
  media: Map<string, Media>
  entries: Map<string, Entry>
  /** Null until the first-run choice of what to classify. */
  prefs: Preferences | null
  setPrefs: (next: Preferences) => void
  catalogs: Catalogs
  loading: Partial<Record<SourceKey, boolean>>
  errors: Partial<Record<SourceKey, string>>
  /** Device storage failures. */
  error: string | null
  canUndo: boolean
  swipe: (mediaId: string, action: SwipeAction, via: Entry['via']) => void
  rate: (mediaId: string, rating: number) => void
  skipRating: (mediaId: string) => void
  /** Deletes the record so the card returns to the deck as unseen. */
  removeEntry: (mediaId: string) => void
  toggleFavorite: (mediaId: string) => void
  undo: () => string | null
  loadMore: (source: SourceKey) => Promise<void>
  clearSourceErrors: () => void
  recs: RecsCache | null
  recsStatus: RecsStatus
  recsError: string | null
  refreshRecs: () => Promise<void>
  exportData: () => ExportFile
  importData: (file: ExportFile) => Promise<number>
  resetAll: () => Promise<void>
  cloud: CloudState
  signIn: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
  syncNow: () => void
  deleteAccount: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [media, setMedia] = useState(new Map<string, Media>())
  const [entries, setEntries] = useState(new Map<string, Entry>())
  const [prefs, setPrefsState] = useState<Preferences | null>(null)
  const [catalogs, setCatalogs] = useState<Catalogs>({})
  const [loading, setLoading] = useState<Partial<Record<SourceKey, boolean>>>({})
  const [errors, setErrors] = useState<Partial<Record<SourceKey, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<UndoStep[]>([])
  const [recs, setRecs] = useState<RecsCache | null>(null)
  const [recsStatus, setRecsStatus] = useState<RecsStatus>('idle')
  const [recsError, setRecsError] = useState<string | null>(null)

  // Refs mirror state so async callbacks never act on a stale snapshot. Catalogs and prefs are
  // written through commit helpers, so concurrent page loads merge instead of overwriting.
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const mediaRef = useRef(media)
  mediaRef.current = media
  const prefsRef = useRef<Preferences | null>(null)
  const catalogsRef = useRef<Catalogs>({})
  const loadingRef = useRef(new Set<SourceKey>())
  const recsBuilding = useRef(false)

  const commitPrefs = useCallback((next: Preferences) => {
    prefsRef.current = next
    setPrefsState(next)
    db.savePrefs(next).catch((e) => setError(`Falha ao salvar preferências: ${errorText(e)}`))
  }, [])

  const commitCatalogs = useCallback((next: Catalogs) => {
    catalogsRef.current = next
    setCatalogs(next)
    db.saveCatalogs(next).catch((e) => setError(`Falha ao salvar o catálogo: ${errorText(e)}`))
  }, [])

  const addMedia = useCallback((items: Media[]) => {
    if (!items.length) return
    setMedia((m) => {
      const copy = new Map(m)
      for (const item of items) copy.set(item.id, item)
      return copy
    })
  }, [])

  // Remote changes already passed the IndexedDB check; re-check against state in case of a
  // local change made while the sync was in flight.
  const applyRemote = useCallback((changes: RemoteChange[]) => {
    setEntries((m) => {
      const next = new Map(m)
      for (const change of changes) {
        const current = next.get(change.mediaId)
        if (current && revOf(current) >= change.rev) continue
        if (change.entry) next.set(change.mediaId, change.entry)
        else next.delete(change.mediaId)
      }
      return next
    })
    const snapshots = changes.flatMap((c) => (c.media ? [c.media] : []))
    if (snapshots.length) {
      setMedia((m) => {
        const copy = new Map(m)
        for (const item of snapshots) if (!copy.has(item.id)) copy.set(item.id, item)
        return copy
      })
    }
  }, [])

  const applyRemotePrefs = useCallback(
    (remote: Preferences) => {
      const local = prefsRef.current
      if (!local || remote.updatedAt > local.updatedAt) commitPrefs(remote)
    },
    [commitPrefs],
  )

  const {
    state: cloud,
    schedule,
    signIn,
    verifyCode,
    signOut,
    syncNow,
    deleteAccount: deleteCloudAccount,
  } = useCloudSync({ onApplied: applyRemote, getPrefs: () => prefsRef.current, onRemotePrefs: applyRemotePrefs })

  useEffect(() => {
    db.loadAll()
      .then((data) => {
        const loadedPrefs = data.prefs ? normalizePrefs(data.prefs) : null
        let loadedCatalogs = data.catalogs ?? {}
        // Before TMDB there was one anime catalog; keep its pages so the deck continues.
        if (!data.catalogs && data.legacyCatalog) {
          loadedCatalogs = {
            anime: {
              ids: data.legacyCatalog.order,
              nextPage: data.legacyCatalog.nextPage,
              hasNextPage: data.legacyCatalog.hasNextPage,
              hash: filterHash(loadedPrefs ?? DEFAULT_PREFS),
              emptyPages: 0,
            },
          }
        }
        prefsRef.current = loadedPrefs
        catalogsRef.current = loadedCatalogs
        setMedia(new Map(data.media.map((m) => [m.id, m])))
        setEntries(new Map(data.entries.map((e) => [e.mediaId, e])))
        setPrefsState(loadedPrefs)
        setCatalogs(loadedCatalogs)
        setRecs(data.recs ?? null)
      })
      .catch((e) => setError(`Falha ao abrir o banco local: ${errorText(e)}`))
      .finally(() => setReady(true))
  }, [])

  const setPrefs = useCallback<Store['setPrefs']>(
    (next) => {
      commitPrefs({ ...next, updatedAt: Date.now() })
      // New filters deserve a fresh try at every source.
      setErrors({})
      schedule()
    },
    [commitPrefs, schedule],
  )

  const writeEntry = useCallback(
    (entry: Entry, prev: Entry | undefined) => {
      const stamped = { ...entry, rev: Date.now() }
      setEntries((m) => new Map(m).set(stamped.mediaId, stamped))
      setUndoStack((s) => [...s.slice(-49), { mediaId: stamped.mediaId, prev }])
      db.saveLocalEntries([stamped])
        .then(() => schedule())
        .catch((e) => setError(`Falha ao salvar: ${errorText(e)}`))
    },
    [schedule],
  )

  const swipe = useCallback<Store['swipe']>(
    (mediaId, action, via) => {
      writeEntry(applyAction(mediaId, action, via, Date.now()), entriesRef.current.get(mediaId))
    },
    [writeEntry],
  )

  const rate = useCallback<Store['rate']>(
    (mediaId, rating) => {
      const prev = entriesRef.current.get(mediaId)
      if (!prev) return
      writeEntry({ ...prev, status: 'seen', rating, updatedAt: Date.now() }, prev)
    },
    [writeEntry],
  )

  const skipRating = useCallback<Store['skipRating']>(
    (mediaId) => {
      const prev = entriesRef.current.get(mediaId)
      if (!prev) return
      writeEntry({ ...prev, queuedAt: Date.now() }, prev)
    },
    [writeEntry],
  )

  const toggleFavorite = useCallback<Store['toggleFavorite']>(
    (mediaId) => {
      const prev = entriesRef.current.get(mediaId)
      if (!prev) return
      writeEntry({ ...prev, favorite: !prev.favorite, updatedAt: Date.now() }, prev)
    },
    [writeEntry],
  )

  const removeEntry = useCallback<Store['removeEntry']>(
    (mediaId) => {
      const prev = entriesRef.current.get(mediaId)
      if (!prev) return
      setEntries((m) => {
        const next = new Map(m)
        next.delete(mediaId)
        return next
      })
      setUndoStack((s) => [...s.slice(-49), { mediaId, prev }])
      db.removeLocalEntry(mediaId, Date.now())
        .then(() => schedule())
        .catch((e) => setError(`Falha ao remover: ${errorText(e)}`))
    },
    [schedule],
  )

  const undo = useCallback<Store['undo']>(() => {
    const step = undoStack[undoStack.length - 1]
    if (!step) return null
    setUndoStack((s) => s.slice(0, -1))
    // Restoring is a new change: re-stamp it so it also wins over the cloud copy.
    const restored = step.prev && { ...step.prev, rev: Date.now() }
    setEntries((m) => {
      const next = new Map(m)
      if (restored) next.set(step.mediaId, restored)
      else next.delete(step.mediaId)
      return next
    })
    const persist = restored ? db.saveLocalEntries([restored]) : db.removeLocalEntry(step.mediaId, Date.now())
    persist.then(() => schedule()).catch((e) => setError(`Falha ao desfazer: ${errorText(e)}`))
    return step.mediaId
  }, [undoStack, schedule])

  const loadMore = useCallback<Store['loadMore']>(
    async (source) => {
      const current = prefsRef.current
      if (!current || loadingRef.current.has(source)) return
      const hash = filterHash(current)
      const cat = catalogFor(catalogsRef.current, source, hash)
      if (!cat.hasNextPage) return
      loadingRef.current.add(source)
      setLoading((l) => ({ ...l, [source]: true }))
      try {
        const { media: page, hasNextPage } = await fetchSourcePage(source, cat.nextPage, current)
        // Filters changed while the page was in flight: it belongs to a catalog nobody shows.
        if (!prefsRef.current || filterHash(prefsRef.current) !== hash) return
        await db.saveMedia(page)
        addMedia(page)
        const latest = catalogFor(catalogsRef.current, source, hash)
        const known = new Set(latest.ids)
        const added = page.map((m) => m.id).filter((id) => !known.has(id))
        const freshAdded = added.some((id) => !entriesRef.current.has(id))
        commitCatalogs({
          ...catalogsRef.current,
          [source]: {
            ids: [...latest.ids, ...added],
            nextPage: latest.nextPage + 1,
            hasNextPage,
            hash,
            emptyPages: freshAdded ? 0 : latest.emptyPages + 1,
          },
        })
        setErrors((e) => {
          const { [source]: _dropped, ...rest } = e
          return rest
        })
      } catch (e) {
        setErrors((errs) => ({ ...errs, [source]: describeSourceError(source, e) }))
      } finally {
        loadingRef.current.delete(source)
        setLoading((l) => ({ ...l, [source]: false }))
      }
    },
    [addMedia, commitCatalogs],
  )

  const clearSourceErrors = useCallback(() => setErrors({}), [])

  const refreshRecs = useCallback(async () => {
    const current = prefsRef.current
    if (!current || recsBuilding.current) return
    recsBuilding.current = true
    setRecsStatus('building')
    setRecsError(null)
    try {
      const built = await buildRecs(entriesRef.current, mediaRef.current, current, {
        anime: fetchAnimeRecs,
        tmdb: fetchTmdbRecs,
      })
      await db.saveMedia(built.media)
      addMedia(built.media)
      await db.saveRecs(built.cache)
      setRecs(built.cache)
      setRecsStatus('idle')
      if (built.failures) setRecsError('Parte das fontes não respondeu; a lista pode estar incompleta.')
    } catch (e) {
      setRecsStatus('error')
      setRecsError(`Não consegui montar recomendações: ${errorText(e)}`)
    } finally {
      recsBuilding.current = false
    }
  }, [addMedia])

  const exportData = useCallback<Store['exportData']>(() => {
    const list = [...entries.values()]
    return {
      app: 'myanimeswipe',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: list,
      media: list.map((e) => media.get(e.mediaId)).filter((m): m is Media => !!m),
      prefs: prefs ?? undefined,
    }
  }, [entries, media, prefs])

  const importData = useCallback<Store['importData']>(
    async (file) => {
      if (file?.app !== 'myanimeswipe' || file.version !== 1 || !Array.isArray(file.entries)) {
        throw new Error(`Arquivo não é um backup do ${APP_NAME}.`)
      }
      const now = Date.now()
      const imported = file.entries.map((e) => ({ ...e, rev: now }))
      await db.saveMedia(file.media ?? [])
      await db.saveLocalEntries(imported)
      addMedia(file.media ?? [])
      setEntries((m) => {
        const copy = new Map(m)
        for (const e of imported) copy.set(e.mediaId, e)
        return copy
      })
      if (file.prefs) commitPrefs({ ...normalizePrefs(file.prefs), updatedAt: now })
      setUndoStack([])
      schedule()
      return imported.length
    },
    [addMedia, commitPrefs, schedule],
  )

  const resetAll = useCallback(async () => {
    await db.clearAll()
    prefsRef.current = null
    catalogsRef.current = {}
    setMedia(new Map())
    setEntries(new Map())
    setPrefsState(null)
    setCatalogs({})
    setErrors({})
    setRecs(null)
    setUndoStack([])
    // When signed in, the cloud copy comes back with the next pull.
    schedule(0)
  }, [schedule])

  const deleteAccount = useCallback(async () => {
    await deleteCloudAccount()
    await resetAll()
  }, [deleteCloudAccount, resetAll])

  return (
    <Ctx.Provider
      value={{
        ready,
        media,
        entries,
        prefs,
        setPrefs,
        catalogs,
        loading,
        errors,
        error,
        canUndo: undoStack.length > 0,
        swipe,
        rate,
        skipRating,
        removeEntry,
        toggleFavorite,
        undo,
        loadMore,
        clearSourceErrors,
        recs,
        recsStatus,
        recsError,
        refreshRecs,
        exportData,
        importData,
        resetAll,
        cloud,
        signIn,
        verifyCode,
        signOut,
        syncNow,
        deleteAccount,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
