import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { APP_NAME } from './brand'
import * as db from './db'
import { applyAction } from './logic'
import { DEFAULT_PREFS, filterHash, normalizePrefs, type Preferences } from './prefs'
import { FAVORITE_STARS, fromStars, rescaled } from './rating'
import { buildRecs, type RecsCache } from './recs/engine'
import { hiddenSequels, sequelLookups, walkSequels, withLookups, type SequelChains } from './sequels'
import { fetchAnimeRecs, fetchDirectSequels, RateLimitError } from './sources/anilist'
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
  /** Classifies a title that may not be in any catalog yet (search, a friend's list). */
  classify: (m: Media, action: SwipeAction, via: Entry['via']) => void
  /** Saves a stored 0 to 10 rating; the top one (shown 9) also marks the favorite, any other clears it. */
  rate: (mediaId: string, rating: number) => void
  /**
   * Rating from the title sheet: works on titles not in the library yet (they become seen). Null
   * takes the rating away and sends the title back to the rating queue, the old rating suggested.
   */
  rateMedia: (m: Media, rating: number | null, via: Entry['via']) => void
  skipRating: (mediaId: string) => void
  /** Deletes the record so the card returns to the deck as unseen. */
  removeEntry: (mediaId: string) => void
  /** Favorite and 9 are the same: favoriting gives 9, unfavoriting a 9 makes it 8. */
  toggleFavorite: (mediaId: string) => void
  undo: () => string | null
  loadMore: (source: SourceKey) => Promise<void>
  clearSourceErrors: () => void
  recs: RecsCache | null
  recsStatus: RecsStatus
  recsError: string | null
  refreshRecs: () => Promise<void>
  /** Later seasons of the anime in Larguei: never suggested in Descobrir or Para você. */
  hidden: ReadonlySet<string>
  exportData: () => ExportFile
  importData: (file: ExportFile) => Promise<number>
  resetAll: () => Promise<void>
  cloud: CloudState
  signIn: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
  syncNow: () => void
  deleteAccount: () => Promise<void>
  /** Ratings from the old 1 to 8 scale went back to the queue and the person was not told yet. */
  rescaleNotice: boolean
  dismissRescaleNotice: () => void
}

const Ctx = createContext<Store | null>(null)

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Stored values of the top rating (9, the favorite) and of the one below it (8). */
const TOP = fromStars(FAVORITE_STARS)
const BELOW_TOP = fromStars(FAVORITE_STARS - 1)

const NOTICE_KEY = 'watchmatch:rescaleNotice'

/** A burst of changes (a sync, quick swipes) becomes one sequel lookup. */
const SEQUEL_WAIT_MS = 800
/** Offline or AniList down: try the lookup again after this. */
const SEQUEL_RETRY_MS = 2 * 60 * 1000

function readNotice() {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

function writeNotice(on: boolean) {
  try {
    if (on) localStorage.setItem(NOTICE_KEY, '1')
    else localStorage.removeItem(NOTICE_KEY)
  } catch {
    // Shown for this visit only.
  }
}

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
  const [rescaleNotice, setRescaleNotice] = useState(readNotice)
  const [sequels, setSequels] = useState<SequelChains>({})
  const [sequelRetry, setSequelRetry] = useState(0)

  const raiseRescaleNotice = useCallback(() => {
    writeNotice(true)
    setRescaleNotice(true)
  }, [])

  const dismissRescaleNotice = useCallback(() => {
    writeNotice(false)
    setRescaleNotice(false)
  }, [])

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
  const sequelsRef = useRef<SequelChains>({})
  const sequelBusy = useRef(false)
  const hidden = useMemo(() => hiddenSequels(entries, sequels), [entries, sequels])
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  /** The sync scheduler, which only exists after useCloudSync below. */
  const scheduleRef = useRef<(delay?: number) => void>(() => {})

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
    // Old scale ratings that arrived went back to the queue here: tell the person, send them up.
    if (changes.some((c) => c.rescaled)) {
      raiseRescaleNotice()
      scheduleRef.current()
    }
  }, [raiseRescaleNotice])

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
  scheduleRef.current = schedule

  useEffect(() => {
    db.rescaleOldRatings()
      .then((count) => count > 0 && raiseRescaleNotice())
      .catch(() => {})
      .then(() => db.loadAll())
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
        sequelsRef.current = data.sequels ?? {}
        setMedia(new Map(data.media.map((m) => [m.id, m])))
        setEntries(new Map(data.entries.map((e) => [e.mediaId, e])))
        setPrefsState(loadedPrefs)
        setCatalogs(loadedCatalogs)
        setRecs(data.recs ?? null)
        setSequels(sequelsRef.current)
      })
      .catch((e) => setError(`Falha ao abrir o banco local: ${errorText(e)}`))
      .finally(() => setReady(true))
  }, [raiseRescaleNotice])

  // Dropped anime whose later seasons are not known yet: ask AniList, all of them in one walk.
  const lookups = useMemo(() => (ready ? sequelLookups(entries, sequels, Date.now()).join(',') : ''), [ready, entries, sequels])
  useEffect(() => {
    if (!lookups || sequelBusy.current) return
    const timer = setTimeout(() => {
      sequelBusy.current = true
      walkSequels(lookups.split(',').map(Number), fetchDirectSequels).then(
        (found) => {
          sequelBusy.current = false
          sequelsRef.current = withLookups(sequelsRef.current, found, Date.now())
          setSequels(sequelsRef.current)
          db.saveSequels(sequelsRef.current).catch(() => {})
        },
        (e) => {
          sequelBusy.current = false
          // Nothing is hidden meanwhile; the lookup runs again later.
          const wait = e instanceof RateLimitError ? e.retryAfterSec * 1000 : SEQUEL_RETRY_MS
          setTimeout(() => setSequelRetry((n) => n + 1), wait)
        },
      )
    }, SEQUEL_WAIT_MS)
    return () => clearTimeout(timer)
  }, [lookups, sequelRetry])

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

  const classify = useCallback<Store['classify']>(
    (m, action, via) => {
      if (!mediaRef.current.has(m.id)) {
        addMedia([m])
        db.saveMedia([m]).catch((e) => setError(`Falha ao salvar: ${errorText(e)}`))
      }
      swipe(m.id, action, via)
    },
    [addMedia, swipe],
  )

  const rate = useCallback<Store['rate']>(
    (mediaId, rating) => {
      const prev = entriesRef.current.get(mediaId)
      if (!prev) return
      writeEntry({ ...prev, status: 'seen', rating, favorite: rating === TOP, updatedAt: Date.now() }, prev)
    },
    [writeEntry],
  )

  const rateMedia = useCallback<Store['rateMedia']>(
    (m, rating, via) => {
      if (!mediaRef.current.has(m.id)) {
        addMedia([m])
        db.saveMedia([m]).catch((e) => setError(`Falha ao salvar: ${errorText(e)}`))
      }
      const prev = entriesRef.current.get(m.id)
      const now = Date.now()
      const base: Entry = prev ?? { mediaId: m.id, status: 'seen', rating: null, suggestedRating: null, via, updatedAt: now }
      const next: Entry =
        rating === null
          ? {
              ...base,
              status: 'seen',
              rating: null,
              suggestedRating: base.rating ?? base.suggestedRating,
              favorite: false,
              queuedAt: now,
              updatedAt: now,
            }
          : { ...base, status: 'seen', rating, favorite: rating === TOP, updatedAt: now }
      writeEntry(next, prev)
    },
    [addMedia, writeEntry],
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
      const next: Entry = prev.favorite
        ? {
            ...prev,
            favorite: false,
            rating: prev.rating === TOP ? BELOW_TOP : prev.rating,
            suggestedRating: prev.suggestedRating === TOP ? BELOW_TOP : prev.suggestedRating,
          }
        : { ...prev, favorite: true, status: 'seen', rating: prev.rating === null ? null : TOP, suggestedRating: TOP }
      writeEntry({ ...next, updatedAt: Date.now() }, prev)
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
        const freshAdded = added.some((id) => !entriesRef.current.has(id) && !hiddenRef.current.has(id))
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
      const built = await buildRecs(
        entriesRef.current,
        mediaRef.current,
        current,
        { anime: fetchAnimeRecs, tmdb: fetchTmdbRecs },
        Date.now(),
        hiddenRef.current,
      )
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
      // Backups from before the 1 to 9 scale bring their ratings back as suggestions.
      const imported = file.entries.map((e) => ({ ...(rescaled(e) ?? e), rev: now }))
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
    sequelsRef.current = {}
    setMedia(new Map())
    setEntries(new Map())
    setPrefsState(null)
    setCatalogs({})
    setErrors({})
    setRecs(null)
    setSequels({})
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
        classify,
        rate,
        rateMedia,
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
        hidden,
        exportData,
        importData,
        resetAll,
        cloud,
        signIn,
        verifyCode,
        signOut,
        syncNow,
        deleteAccount,
        rescaleNotice,
        dismissRescaleNotice,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
