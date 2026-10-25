import { useEffect, useMemo } from 'react'
import { buildDeck, countFresh } from '../logic'
import { useStore } from '../store'
import { SwipeDeck } from './SwipeDeck'

/** Fetch the next AniList page once fewer than this many unswiped cards remain. */
const PREFETCH_AT = 15

export function DiscoverTab() {
  const { ready, catalog, entries, loading, error, loadMore } = useStore()
  const deck = useMemo(() => buildDeck(catalog.order, entries), [catalog.order, entries])
  const fresh = useMemo(() => countFresh(catalog.order, entries), [catalog.order, entries])

  useEffect(() => {
    if (ready && !error && fresh < PREFETCH_AT && catalog.hasNextPage) loadMore()
  }, [ready, error, fresh, catalog.hasNextPage, loadMore])

  return (
    <SwipeDeck
      ids={deck}
      via="discover"
      empty={
        error ? (
          <div className="notice">
            <p>{error}</p>
            <button onClick={() => loadMore()}>Tentar de novo</button>
          </div>
        ) : loading || !ready ? (
          <p className="notice">Carregando animes…</p>
        ) : (
          <p className="notice">Você passou por todo o catálogo. Impressionante.</p>
        )
      }
    />
  )
}
