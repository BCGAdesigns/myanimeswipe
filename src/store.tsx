import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import { applyAction } from './logic'
import { fetchCatalogPage, RateLimitError } from './sources/anilist'
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

  const writeEntry = useCallback((entry: Entry, prev: Entry | undefined) => {
    setEntries((m) => new Map(m).set(entry.mediaId, entry))
    setUndoStack((s) => [...s.slice(-49), { mediaId: entry.mediaId, prev }])
    db.putEntry(entry).catch((e) => setError(`Falha ao salvar: ${String(e)}`))
  }, [])

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

  const removeEntry = useCallback<Store['removeEntry']>((mediaId) => {
    const prev = entriesRef.current.get(mediaId)
    if (!prev) return
    setEntries((m) => {
      const next = new Map(m)
      next.delete(mediaId)
      return next
    })
    setUndoStack((s) => [...s.slice(-49), { mediaId, prev }])
    db.deleteEntry(mediaId).catch((e) => setError(`Falha ao remover: ${String(e)}`))
  }, [])

  const undo = useCallback<Store['undo']>(() => {
    const step = undoStack[undoStack.length - 1]
    if (!step) return null
    setUndoStack((s) => s.slice(0, -1))
    setEntries((m) => {
      const next = new Map(m)
      if (step.prev) next.set(step.mediaId, step.prev)
      else next.delete(step.mediaId)
      return next
    })
    const persist = step.prev ? db.putEntry(step.prev) : db.deleteEntry(step.mediaId)
    persist.catch((e) => setError(`Falha ao desfazer: ${String(e)}`))
    return step.mediaId
  }, [undoStack])

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
    await db.saveMedia(file.media ?? [])
    await db.putEntries(file.entries)
    setMedia((m) => {
      const copy = new Map(m)
      for (const item of file.media ?? []) copy.set(item.id, item)
      return copy
    })
    setEntries((m) => {
      const copy = new Map(m)
      for (const e of file.entries) copy.set(e.mediaId, e)
      return copy
    })
    setUndoStack([])
    return file.entries.length
  }, [])

  const resetAll = useCallback(async () => {
    await db.clearAll()
    setMedia(new Map())
    setEntries(new Map())
    setCatalog({ order: [], nextPage: 1, hasNextPage: true })
    setUndoStack([])
  }, [])

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
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
