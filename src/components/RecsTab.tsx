import { useEffect, useMemo } from 'react'
import { buildDeck, countFresh } from '../logic'
import { isStale, MIN_POSITIVE_SIGNALS, pickSeeds, seedKeyOf } from '../recs/engine'
import { useStore } from '../store'
import { SwipeDeck } from './SwipeDeck'

/** Rebuild with the latest likes once fewer than this many recommendations are left. */
const REFILL_AT = 5

export function RecsTab({ onOpenPrefs }: { onOpenPrefs: () => void }) {
  const { ready, prefs, entries, media, recs, recsStatus, recsError, refreshRecs } = useStore()

  const seeds = useMemo(() => (prefs ? pickSeeds(entries, media, prefs) : null), [entries, media, prefs])
  const positive = seeds?.all.length ?? 0
  const seedKey = seeds ? seedKeyOf(seeds) : ''
  const deck = useMemo(
    () => (recs ? buildDeck(recs.ids, entries).filter((id) => media.has(id)) : []),
    [recs, entries, media],
  )
  const fresh = useMemo(() => (recs ? countFresh(recs.ids, entries) : 0), [recs, entries])

  useEffect(() => {
    if (!ready || !prefs || positive < MIN_POSITIVE_SIGNALS || recsStatus !== 'idle') return
    const refill = fresh < REFILL_AT && recs?.seedKey !== seedKey
    if (isStale(recs, prefs, Date.now()) || refill) void refreshRecs()
  }, [ready, prefs, positive, recsStatus, recs, fresh, seedKey, refreshRecs])

  if (ready && positive < MIN_POSITIVE_SIGNALS) {
    return (
      <div className="empty-state">
        <p className="empty-icon" aria-hidden>
          ✨
        </p>
        <h2>Suas recomendações começam aqui</h2>
        <p>
          Curta pelo menos {MIN_POSITIVE_SIGNALS} títulos na aba Descobrir: toque duas vezes (gostei), segure (favorito)
          ou dê nota 7 ou mais.
        </p>
        <div className="progress" aria-label={`${positive} de ${MIN_POSITIVE_SIGNALS}`}>
          {Array.from({ length: MIN_POSITIVE_SIGNALS }, (_, i) => (
            <span key={i} className={i < positive ? 'on' : ''} />
          ))}
        </div>
      </div>
    )
  }

  const building = recsStatus === 'building'
  const seedCount = seeds ? seeds.anime.length + seeds.tmdb.length : 0

  return (
    <SwipeDeck
      ids={deck}
      via="recs"
      reasons={recs?.reasons}
      banner={
        <div className="recs-bar">
          <span>
            {building
              ? 'Atualizando…'
              : (recsError ?? `Com base em ${seedCount} ${seedCount === 1 ? 'título' : 'títulos'} que você curtiu`)}
          </span>
          <button className="link-btn" disabled={building} onClick={() => void refreshRecs()}>
            Atualizar
          </button>
        </div>
      }
      empty={
        !ready || building ? (
          <div className="skeleton-card" aria-label="Montando recomendações" />
        ) : recsStatus === 'error' ? (
          <div className="empty-state">
            <p className="empty-icon" aria-hidden>
              📡
            </p>
            <p>{recsError}</p>
            <button className="primary" onClick={() => void refreshRecs()}>
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-icon" aria-hidden>
              🎯
            </p>
            <h2>Por enquanto é isso</h2>
            <p>Curta mais títulos para renovar a lista, ou abra os filtros se eles estiverem apertados demais.</p>
            <div className="row center">
              <button className="primary" onClick={() => void refreshRecs()}>
                Atualizar
              </button>
              <button onClick={onOpenPrefs}>Filtros</button>
            </div>
          </div>
        )
      }
    />
  )
}
