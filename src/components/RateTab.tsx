import { Check, ChevronLeft, Star, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { arrangeEntries } from '../library'
import { classifyRateSwipe, rateQueue, ratedList, rateVector } from '../logic'
import { fromStars, STARS, toStars } from '../rating'
import { useStore } from '../store'
import { LibraryControls, usePersistentView } from './LibraryControls'
import { Cover, coverThumb, metaLine } from './MediaCard'
import { SwipeCard, type ActionStyle, type SwipeCardHandle } from './SwipeCard'

type RateKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'
type RateAction = RateKey | 'skip'

/** Red for 1 through yellow to green for 8. */
export const starHue = (stars: number) => Math.round(((stars - 1) * 120) / 7)

const RATE_STYLES = {
  ...Object.fromEntries(
    STARS.map((n) => [
      String(n),
      { text: String(n), color: `hsl(${starHue(n)} 80% 66%)`, vector: rateVector(n), icon: <Star strokeWidth={2.6} fill="currentColor" /> },
    ]),
  ),
  skip: { text: 'PULAR', color: '#9ca3af', vector: [-1, 0], icon: <ChevronLeft strokeWidth={2.6} /> },
} as Record<RateAction, ActionStyle>

/** Each number sits around the card where its drag goes. */
const DIAL: { stars: number; area: string; arrow: string }[] = [
  { stars: 1, area: 'nw', arrow: '↖' },
  { stars: 8, area: 'n', arrow: '↑' },
  { stars: 7, area: 'ne', arrow: '↗' },
  { stars: 2, area: 'w', arrow: '←' },
  { stars: 6, area: 'e', arrow: '→' },
  { stars: 3, area: 'sw', arrow: '↙' },
  { stars: 4, area: 's', arrow: '↓' },
  { stars: 5, area: 'se', arrow: '↘' },
]

const keyOf = (stars: number) => String(stars) as RateKey

export function RateTab() {
  const { entries, media, rate, skipRating, undo, canUndo } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  /** The rating the drag points at right now. */
  const [aim, setAim] = useState<number | null>(null)
  const cardRef = useRef<SwipeCardHandle<RateAction>>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const [view, setView] = usePersistentView('rated')
  const queue = useMemo(() => rateQueue(entries), [entries])
  const allRated = useMemo(() => ratedList(entries), [entries])
  const rated = useMemo(() => arrangeEntries(allRated, media, view), [allRated, media, view])

  const current = editingId ? entries.get(editingId) : queue[0]
  const currentMedia = current ? media.get(current.mediaId) : undefined
  const stored = current ? ((editingId ? current.rating : null) ?? current.suggestedRating) : null
  const highlighted = stored === null ? null : toStars(stored)

  // Typed with skip too, so the card also knows the Pular fling.
  const classify = (dx: number, dy: number, threshold?: number): RateAction | null => {
    const stars = classifyRateSwipe(dx, dy, threshold)
    return stars === null ? null : keyOf(stars)
  }

  const onAction = (a: RateAction) => {
    setAim(null)
    if (!current) return
    if (a === 'skip') {
      if (!editingId) skipRating(current.mediaId)
    } else {
      navigator.vibrate?.(8)
      rate(current.mediaId, fromStars(Number(a)))
    }
    setEditingId(null)
  }

  const confirm = () => {
    if (highlighted !== null) cardRef.current?.fling(keyOf(highlighted))
  }

  const startEdit = (id: string) => {
    setEditingId(id)
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Desktop: number keys rate, Enter confirms the suggestion, P skips, Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[aria-modal="true"]')) return
      const card = cardRef.current
      if (e.key === 'z') undo()
      else if (!card) return
      else if (/^[1-8]$/.test(e.key)) card.fling(e.key as RateKey)
      else if (e.key === 'Enter' && highlighted !== null) card.fling(keyOf(highlighted))
      else if (e.key === 'p') card.fling('skip')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [highlighted, undo])

  return (
    <div className="rate-tab">
      <div ref={topRef} className="rate-top">
        {current && currentMedia ? (
          <>
            <p className="rate-count">
              <span>{editingId ? 'Mudando a nota' : `${queue.length} ${queue.length === 1 ? 'título' : 'títulos'} para avaliar`}</span>
              <span>{highlighted !== null ? 'Toque 2× para confirmar' : 'Arraste para a nota'}</span>
            </p>
            <div className="rate-dial">
              {DIAL.map((d) => (
                <button
                  key={d.stars}
                  className={`dial-btn ${d.area}${d.stars === highlighted ? ' is-suggested' : ''}${d.stars === aim ? ' is-aim' : ''}`}
                  style={{ ['--s' as string]: d.stars }}
                  aria-label={`Nota ${d.stars}`}
                  title={`${d.arrow} nota ${d.stars}`}
                  onClick={() => cardRef.current?.fling(keyOf(d.stars))}
                >
                  {d.stars}
                </button>
              ))}
              <div className="rate-deck">
                <SwipeCard
                  key={`${current.mediaId}-${current.queuedAt}-${editingId ?? ''}`}
                  ref={cardRef}
                  classify={classify}
                  styles={RATE_STYLES}
                  onAction={onAction}
                  onPreview={(a) => setAim(a && a !== 'skip' ? Number(a) : null)}
                  onDoubleTap={confirm}
                >
                  <div className="rate-card">
                    <Cover src={currentMedia.cover} />
                    <div>
                      <h2>
                        {current.favorite && <Star className="fav-star" size={16} fill="currentColor" />} {currentMedia.title}
                      </h2>
                      <p className="meta">{metaLine(currentMedia, true)}</p>
                      {highlighted !== null && (
                        <p className="suggested">
                          {editingId ? 'Nota atual' : 'Sugestão'}: <strong>{highlighted}</strong>
                        </p>
                      )}
                    </div>
                  </div>
                </SwipeCard>
              </div>
            </div>
            <div className="rate-actions">
              <button onClick={() => cardRef.current?.fling('skip')}>
                <ChevronLeft /> {editingId ? 'Cancelar' : 'Pular'}
              </button>
              <button disabled={!canUndo} onClick={() => undo()}>
                <Undo2 /> Desfazer
              </button>
              <button className={highlighted === null ? undefined : 'primary'} disabled={highlighted === null} onClick={confirm}>
                <Check /> {highlighted === null ? 'Confirmar' : `Confirmar ${highlighted}`}
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p className="empty-icon" aria-hidden>
              ⭐
            </p>
            <h2>Tudo avaliado</h2>
            <p>O que você marcar como já visto aparece aqui para receber nota de 1 a 8, arrastando na direção da nota.</p>
            {canUndo && (
              <button onClick={() => undo()}>
                <Undo2 size={16} /> Desfazer
              </button>
            )}
          </div>
        )}
      </div>

      {allRated.length > 0 && (
        <section className="rated">
          <h3>
            Avaliados <span className="muted">{allRated.length}</span>
          </h3>
          <LibraryControls
            view={view}
            onChange={setView}
            sorts={['recent', 'rating-desc', 'rating-asc', 'title', 'year', 'score']}
            showFavorites
          />
          {rated.length === 0 && <p className="muted small">Nenhum avaliado com esse filtro.</p>}
          <ul>
            {rated.map((e) => {
              const m = media.get(e.mediaId)
              if (!m || e.rating === null) return null
              const stars = toStars(e.rating)
              return (
                <li key={e.mediaId}>
                  <button onClick={() => startEdit(e.mediaId)}>
                    <Cover src={coverThumb(m)} lazy />
                    <span className="rated-title">
                      <span>
                        {e.favorite && <Star className="fav-star" size={13} fill="currentColor" />} {m.title}
                      </span>
                      <small>{metaLine(m, true)}</small>
                    </span>
                    <span className="rated-score" style={{ ['--s' as string]: stars }}>
                      {stars}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
