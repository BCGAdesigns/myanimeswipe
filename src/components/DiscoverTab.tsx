import { useEffect, useMemo } from 'react'
import { filterHash } from '../prefs'
import { buildMixedDeck, catalogFor, deckPhase, freshBySource, sourcesFor } from '../sources/catalog'
import { useStore } from '../store'
import type { MediaKind } from '../types'
import { SwipeDeck } from './SwipeDeck'

/** Fetch the next page of a source once fewer than this many of its cards are left. */
const PREFETCH_AT = 10
/** Pages in a row without anything new before prefetch stops trying a source. */
const MAX_EMPTY_PAGES = 3
const NO_KINDS: MediaKind[] = []

export function DiscoverTab({ onOpenPrefs }: { onOpenPrefs: () => void }) {
  const { ready, prefs, catalogs, entries, media, loading, errors, loadMore, clearSourceErrors } = useStore()
  const hash = prefs ? filterHash(prefs) : ''
  const kinds = prefs?.kinds ?? NO_KINDS
  const sources = useMemo(() => sourcesFor(kinds), [kinds])
  const phase = useMemo(() => deckPhase(entries, media), [entries, media])
  const deck = useMemo(
    () => buildMixedDeck(kinds, catalogs, hash, entries, phase).filter((id) => media.has(id)),
    [kinds, catalogs, hash, entries, phase, media],
  )
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
      ids={deck}
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
        !ready || (anyLoading && errorList.length === 0) ? (
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
