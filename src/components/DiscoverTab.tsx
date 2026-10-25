import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { byTaste, deckMode, keepHead, shuffled } from '../discover'
import { filterHash } from '../prefs'
import { tasteProfile } from '../recs/engine'
import { buildMixedDeck, catalogFor, deckPhase, freshBySource, sourcesFor, type SourceKey } from '../sources/catalog'
import { useStore } from '../store'
import type { Entry, MediaKind } from '../types'
import { SwipeDeck } from './SwipeDeck'

/** Fetch the next page of a source once fewer than this many of its cards are left. */
const PREFETCH_AT = 10
/** Dealt by taste or shuffled, a bigger pool to pick from. */
const PREFETCH_AT_ARRANGED = 30
/**
 * Pages in a row without anything new before prefetch stops trying a source. Someone with a big
 * library on a new device goes through many already classified pages first.
 */
const MAX_EMPTY_PAGES = 25
const NO_KINDS: MediaKind[] = []
const NO_IDS: string[] = []
/** One shuffle per visit: the order holds while the app is open and changes the next time. */
const SHUFFLE_SEED = Math.floor(Math.random() * 2 ** 32)
const TASTE_NOTICE_KEY = 'watchmatch:tasteNotice'

/** A card on screen and its record when it was shown; a new record means it was swiped. */
interface ShownCard {
  id: string
  entry: Entry | undefined
  undone?: boolean
}

function readTasteNotice() {
  try {
    return localStorage.getItem(TASTE_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

function writeTasteNotice() {
  try {
    localStorage.setItem(TASTE_NOTICE_KEY, '1')
  } catch {
    // Shown again next visit.
  }
}

export function DiscoverTab({ onOpenPrefs }: { onOpenPrefs: () => void }) {
  const { ready, prefs, catalogs, entries, media, loading, errors, loadMore, clearSourceErrors, cloud, hidden } = useStore()
  const [noticeSeen, setNoticeSeen] = useState(readTasteNotice)
  const hash = prefs ? filterHash(prefs) : ''
  const kinds = prefs?.kinds ?? NO_KINDS
  const sources = useMemo(() => sourcesFor(kinds), [kinds])
  const phase = useMemo(() => deckPhase(entries, media), [entries, media])
  const mode = deckMode(prefs?.discoverOrder ?? 'taste', entries.size)
  const arrange = useMemo(() => {
    if (mode === 'random') return shuffled(SHUFFLE_SEED)
    if (mode === 'taste') return byTaste(media, tasteProfile(entries.values(), media))
    return undefined
  }, [mode, entries, media])
  // The two cards on screen stay put when the order changes behind them (each swipe teaches the
  // taste something, new pages arrive) until something is done with them; an undo puts the title
  // it brought back on top.
  const head = useRef<ShownCard[]>([])
  const deck = useMemo(() => {
    const exhausted = (s: SourceKey) => {
      const cat = catalogFor(catalogs, s, hash)
      return !cat.hasNextPage || cat.emptyPages >= MAX_EMPTY_PAGES || Boolean(errors[s])
    }
    const order = buildMixedDeck(kinds, catalogs, hash, entries, { phase, exhausted, hidden, arrange }).filter((id) => media.has(id))
    const untouched = head.current.filter((c) => c.undone || entries.get(c.id) === c.entry).map((c) => c.id)
    return keepHead(order, untouched)
  }, [kinds, catalogs, hash, entries, phase, media, errors, hidden, arrange])
  const onUndo = useCallback((id: string) => {
    head.current = [{ id, entry: undefined, undone: true }, ...head.current]
  }, [])
  // A signed-in device that never synced shows nothing until the library arrives, or it would
  // offer titles the account already classified.
  const waiting = Boolean(cloud.email) && !cloud.libraryReady
  const shown = waiting ? NO_IDS : deck
  useEffect(() => {
    head.current = shown.slice(0, 2).map((id) => ({ id, entry: entries.get(id) }))
  }, [shown, entries])
  const fresh = useMemo(() => freshBySource(catalogs, sources, hash, entries, hidden), [catalogs, sources, hash, entries, hidden])
  const prefetchAt = mode === 'catalog' ? PREFETCH_AT : PREFETCH_AT_ARRANGED

  useEffect(() => {
    if (!ready || !prefs) return
    for (const s of sources) {
      const cat = catalogFor(catalogs, s, hash)
      if (loading[s] || errors[s] || !cat.hasNextPage || cat.emptyPages >= MAX_EMPTY_PAGES) continue
      if ((fresh[s]?.length ?? 0) < prefetchAt) void loadMore(s)
    }
  }, [ready, prefs, sources, catalogs, hash, loading, errors, fresh, prefetchAt, loadMore])

  const errorList = sources.flatMap((s) => (errors[s] ? [errors[s]!] : []))
  const anyLoading = sources.some((s) => loading[s])
  const retry = () => clearSourceErrors()
  const dismissNotice = () => {
    writeTasteNotice()
    setNoticeSeen(true)
  }

  return (
    <SwipeDeck
      ids={shown}
      via="discover"
      onUndo={onUndo}
      banner={
        errorList.length > 0 && deck.length > 0 ? (
          <div className="banner" role="status">
            <span>{errorList[0]}</span>
            <button className="link-btn" onClick={retry}>
              Tentar de novo
            </button>
          </div>
        ) : mode === 'taste' && !noticeSeen && !waiting && deck.length > 0 ? (
          // Once, when the deck starts following the taste: says so and where to turn it off.
          <div className="banner info" role="status">
            <span>
              <Sparkles /> Agora o que combina com você vem primeiro.
            </span>
            <span className="banner-actions">
              <button
                className="link-btn"
                onClick={() => {
                  dismissNotice()
                  onOpenPrefs()
                }}
              >
                Opções
              </button>
              <button className="link-btn" onClick={dismissNotice}>
                Ok
              </button>
            </span>
          </div>
        ) : null
      }
      empty={
        waiting ? (
          <div className="skeleton-card waiting" aria-label="Trazendo sua biblioteca">
            <span>Trazendo sua biblioteca da nuvem…</span>
          </div>
        ) : !ready || (anyLoading && errorList.length === 0) ? (
          <div className="skeleton-card" aria-label="Carregando" />
        ) : errorList.length > 0 ? (
          <div className="empty-state">
            <p className="empty-icon" aria-hidden>
              📡
            </p>
            <p>{errorList[0]}</p>
            <button className="primary" onClick={retry}>
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-icon" aria-hidden>
              🏁
            </p>
            <h2>Você viu tudo por aqui</h2>
            <p>Não há mais títulos com esses filtros. Mude os filtros ou inclua outros tipos para continuar.</p>
            <button className="primary" onClick={onOpenPrefs}>
              Ajustar filtros
            </button>
          </div>
        )
      }
    />
  )
}
