import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import { applyAction } from './logic'
import { fetchCatalogPage, RateLimitError } from './sources/anilist'
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
}

interface Store {
  ready: boolean
  media: Map<string, Media>
  entries: Map<string, Entry>
  catalog: db.CatalogMeta
  loading: boolean
  error: string | null
  canUndo: boolean
  swipe: (mediaId: string, action: SwipeAction, via: Entry['via']) => void
  rate: (mediaId: string, rating: number) => void
  skipRating: (mediaId: string) => void
  /** Deletes the record so the card returns to the deck as unseen. */
  removeEntry: (mediaId: string) => void
  undo: () => string | null
  loadMore: () => Promise<void>
  exportData: () => ExportFile
  importData: (file: ExportFile) => Promise<number>
  resetAll: () => Promise<void>
  cloud: CloudState
  signIn: (email: string) => Promise<void>
  signOut: () => Promise<void>
  syncNow: () => void
}

const Ctx = createContext<Store | null>(null)

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [media, setMedia] = useState(new Map<string, Media>())
  const [entries, setEntries] = useState(new Map<string, Entry>())
  const [catalog, setCatalog] = useState<db.CatalogMeta>({ order: [], nextPage: 1, hasNextPage: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<UndoStep[]>([])

  // Refs mirror state so async callbacks never act on a stale snapshot.
  const catalogRef = useRef(catalog)
  catalogRef.current = catalog
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const loadingRef = useRef(false)

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

  const { state: cloud, schedule, signIn, signOut, syncNow } = useCloudSync(applyRemote)

  useEffect(() => {
    db.loadAll()
      .then((data) => {
        setMedia(new Map(data.media.map((m) => [m.id, m])))
        setEntries(new Map(data.entries.map((e) => [e.mediaId, e])))
        setCatalog(data.catalog)
      })
      .catch((e) => setError(`Falha ao abrir o banco local: ${String(e)}`))
      .finally(() => setReady(true))
  }, [])

  const writeEntry = useCallback(
    (entry: Entry, prev: Entry | undefined) => {
      const stamped = { ...entry, rev: Date.now() }
      setEntries((m) => new Map(m).set(stamped.mediaId, stamped))
      setUndoStack((s) => [...s.slice(-49), { mediaId: stamped.mediaId, prev }])
      db.saveLocalEntries([stamped])
        .then(() => schedule())
        .catch((e) => setError(`Falha ao salvar: ${String(e)}`))
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
        .catch((e) => setError(`Falha ao remover: ${String(e)}`))
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
    persist.then(() => schedule()).catch((e) => setError(`Falha ao desfazer: ${String(e)}`))
    return step.mediaId
  }, [undoStack, schedule])

  const loadMore = useCallback(async () => {
    const cat = catalogRef.current
    if (loadingRef.current || !cat.hasNextPage) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const { media: page, hasNextPage } = await fetchCatalogPage(cat.nextPage)
      await db.saveMedia(page)
      const known = new Set(cat.order)
      const next: db.CatalogMeta = {
        order: [...cat.order, ...page.map((m) => m.id).filter((id) => !known.has(id))],
        nextPage: cat.nextPage + 1,
        hasNextPage,
      }
      await db.saveCatalog(next)
      setMedia((m) => {
        const copy = new Map(m)
        for (const item of page) copy.set(item.id, item)
        return copy
      })
      setCatalog(next)
    } catch (e) {
      setError(
        e instanceof RateLimitError
          ? `O AniList limitou as requisições. Tente de novo em ${e.retryAfterSec}s.`
          : `Não consegui carregar animes do AniList: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  const exportData = useCallback<Store['exportData']>(() => {
    const list = [...entries.values()]
    return {
      app: 'myanimeswipe',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: list,
      media: list.map((e) => media.get(e.mediaId)).filter((m): m is Media => !!m),
    }
  }, [entries, media])

  const importData = useCallback<Store['importData']>(async (file) => {
    if (file?.app !== 'myanimeswipe' || file.version !== 1 || !Array.isArray(file.entries)) {
      throw new Error('Arquivo não é um backup do MyAnimeSwipe.')
    }
    const now = Date.now()
    const imported = file.entries.map((e) => ({ ...e, rev: now }))
    await db.saveMedia(file.media ?? [])
    await db.saveLocalEntries(imported)
    setMedia((m) => {
      const copy = new Map(m)
      for (const item of file.media ?? []) copy.set(item.id, item)
      return copy
    })
    setEntries((m) => {
      const copy = new Map(m)
      for (const e of imported) copy.set(e.mediaId, e)
      return copy
    })
    setUndoStack([])
    schedule()
    return imported.length
  }, [schedule])

  const resetAll = useCallback(async () => {
    await db.clearAll()
    setMedia(new Map())
    setEntries(new Map())
    setCatalog({ order: [], nextPage: 1, hasNextPage: true })
    setUndoStack([])
    // When signed in, the cloud copy comes back with the next pull.
    schedule(0)
  }, [schedule])

  return (
    <Ctx.Provider
      value={{
        ready,
        media,
        entries,
        catalog,
        loading,
        error,
        canUndo: undoStack.length > 0,
        swipe,
        rate,
        skipRating,
        removeEntry,
        undo,
        loadMore,
        exportData,
        importData,
        resetAll,
        cloud,
        signIn,
        signOut,
        syncNow,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
