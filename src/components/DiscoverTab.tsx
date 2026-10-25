import { useEffect, useMemo } from 'react'
import { filterHash } from '../prefs'
import { buildMixedDeck, catalogFor, deckPhase, freshBySource, sourcesFor, type SourceKey } from '../sources/catalog'
import { useStore } from '../store'
import type { MediaKind } from '../types'
import { SwipeDeck } from './SwipeDeck'

/** Fetch the next page of a source once fewer than this many of its cards are left. */
const PREFETCH_AT = 10
/**
 * Pages in a row without anything new before prefetch stops trying a source. Someone with a big
 * library on a new device goes through many already classified pages first.
 */
const MAX_EMPTY_PAGES = 25
const NO_KINDS: MediaKind[] = []
const NO_IDS: string[] = []

export function DiscoverTab({ onOpenPrefs }: { onOpenPrefs: () => void }) {
  const { ready, prefs, catalogs, entries, media, loading, errors, loadMore, clearSourceErrors, cloud } = useStore()
  const hash = prefs ? filterHash(prefs) : ''
  const kinds = prefs?.kinds ?? NO_KINDS
  const sources = useMemo(() => sourcesFor(kinds), [kinds])
  const phase = useMemo(() => deckPhase(entries, media), [entries, media])
  const deck = useMemo(() => {
    const exhausted = (s: SourceKey) => {
      const cat = catalogFor(catalogs, s, hash)
      return !cat.hasNextPage || cat.emptyPages >= MAX_EMPTY_PAGES || Boolean(errors[s])
    }
    return buildMixedDeck(kinds, catalogs, hash, entries, phase, exhausted).filter((id) => media.has(id))
  }, [kinds, catalogs, hash, entries, phase, media, errors])
  // A signed-in device that never synced shows nothing until the library arrives, or it would
  // offer titles the account already classified.
  const waiting = Boolean(cloud.email) && !cloud.libraryReady
  const fresh = useMemo(() => freshBySource(catalogs, sources, hash, entries), [catalogs, sources, hash, entries])

  useEffect(() => {
    if (!ready || !prefs) return
    for (const s of sources) {
      const cat = catalogFor(catalogs, s, hash)
      if (loading[s] || errors[s] || !cat.hasNextPage || cat.emptyPages >= MAX_EMPTY_PAGES) continue
      if ((fresh[s]?.length ?? 0) < PREFETCH_AT) void loadMore(s)
    }
  }, [ready, prefs, sources, catalogs, hash, loading, errors, fresh, loadMore])

  const errorList = sources.flatMap((s) => (errors[s] ? [errors[s]!] : []))
  const anyLoading = sources.some((s) => loading[s])
  const retry = () => clearSourceErrors()

  return (
    <SwipeDeck
      ids={waiting ? NO_IDS : deck}
      via="discover"
      banner={
        errorList.length > 0 && deck.length > 0 ? (
          <div className="banner" role="status">
            <span>{errorList[0]}</span>
            <button className="link-btn" onClick={retry}>
              Tentar de novo
            </button>
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
