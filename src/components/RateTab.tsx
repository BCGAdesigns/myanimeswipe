import { Check, ChevronDown, ChevronLeft, Eye, EyeOff, Star, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { arrangeEntries } from '../library'
import { classifyRateSwipe, rateQueue, ratedList, rateVector } from '../logic'
import { fromStars, STARS, toStars } from '../rating'
import { useStore } from '../store'
import { LibraryControls, usePersistentView } from './LibraryControls'
import { Cover, coverThumb, MediaCard, metaLine, preloadCover } from './MediaCard'
import { SwipeCard, type ActionStyle, type SwipeCardHandle } from './SwipeCard'

type RateKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'
type RateAction = RateKey | 'skip'

/** Red for 1 through yellow to green for 8. */
export const starHue = (stars: number) => Math.round(((stars - 1) * 120) / 7)

const RATE_STYLES = {
  ...Object.fromEntries(
    STARS.map((n) => [
      String(n),
      { text: `NOTA ${n}`, color: `hsl(${starHue(n)} 80% 66%)`, vector: rateVector(n), icon: <Star strokeWidth={2.6} fill="currentColor" /> },
    ]),
  ),
  skip: { text: 'PULAR', color: '#9ca3af', vector: [-1, 0], icon: <ChevronLeft strokeWidth={2.6} /> },
} as Record<RateAction, ActionStyle>

const EDIT_STYLES: Record<RateAction, ActionStyle> = { ...RATE_STYLES, skip: { ...RATE_STYLES.skip, text: 'CANCELAR' } }

// Pad that mirrors the drag directions, like the one in Descobrir: 8 up, one less at each step
// clockwise. The last row holds what has no direction.
const PAD: (number | 'undo' | 'skip' | 'confirm' | 'hide')[] = [
  1, 8, 7,
  2, 'undo', 6,
  3, 4, 5,
  'skip', 'confirm', 'hide',
]

// Per-device preference, separate from the Descobrir pad; storage can be unavailable (private
// mode), so default to visible.
const PAD_KEY = 'watchmatch:showRatePad'

function readShowPad() {
  try {
    return localStorage.getItem(PAD_KEY) !== '0'
  } catch {
    return true
  }
}

function writeShowPad(show: boolean) {
  try {
    localStorage.setItem(PAD_KEY, show ? '1' : '0')
  } catch {
    // Preference just won't persist.
  }
}

const keyOf = (stars: number) => String(stars) as RateKey

export function RateTab() {
  const { entries, media, rate, skipRating, undo, canUndo } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  /** The rating the drag points at right now. */
  const [aim, setAim] = useState<number | null>(null)
  const [details, setDetails] = useState(false)
  const [showPad, setShowPad] = useState(readShowPad)
  const [returning, setReturning] = useState<string | null>(null)
  const cardRef = useRef<SwipeCardHandle<RateAction>>(null)
  const deckRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const ratedRef = useRef<HTMLElement>(null)

  const [view, setView] = usePersistentView('rated')
  const queue = useMemo(() => rateQueue(entries), [entries])
  const allRated = useMemo(() => ratedList(entries), [entries])
  const rated = useMemo(() => arrangeEntries(allRated, media, view), [allRated, media, view])

  const current = editingId ? entries.get(editingId) : queue[0]
  const currentMedia = current ? media.get(current.mediaId) : undefined
  const next = editingId ? queue[0] : queue[1]
  const nextMedia = next && next.mediaId !== current?.mediaId ? media.get(next.mediaId) : undefined
  const stored = current ? ((editingId ? current.rating : null) ?? current.suggestedRating) : null
  const highlighted = stored === null ? null : toStars(stored)
  const cardKey = current ? `${current.mediaId}-${current.queuedAt}-${editingId ?? ''}` : ''

  useEffect(() => setDetails(false), [cardKey])

  // The card that was behind is now on top; the new one behind starts small again.
  useLayoutEffect(() => {
    deckRef.current?.style.setProperty('--next', '0')
    deckRef.current?.classList.remove('dragging')
  }, [cardKey])

  const onProgress = useCallback((progress: number, dragging: boolean) => {
    const deck = deckRef.current
    if (!deck) return
    deck.style.setProperty('--next', String(progress))
    deck.classList.toggle('dragging', dragging)
  }, [])

  // Warm the image cache for the next covers.
  useEffect(() => {
    for (const e of queue.slice(1, 4)) {
      const m = media.get(e.mediaId)
      if (m) preloadCover(m.cover)
    }
  }, [queue, media])

  const togglePad = () => {
    writeShowPad(!showPad)
    setShowPad(!showPad)
  }

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

  const doUndo = useCallback(() => {
    const id = undo()
    if (id) setReturning(id)
  }, [undo])

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
      if (e.key === 'z') doUndo()
      else if (!card) return
      else if (/^[1-8]$/.test(e.key)) card.fling(e.key as RateKey)
      else if (e.key === 'Enter' && highlighted !== null) card.fling(keyOf(highlighted))
      else if (e.key === 'p') card.fling('skip')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [highlighted, doUndo])

  const skipLabel = editingId ? 'Cancelar' : 'Pular'

  return (
    <div className="rate-tab">
      <div ref={topRef} className={`rate-top${current && currentMedia ? '' : ' done'}`}>
        {current && currentMedia ? (
          <>
            <p className="rate-count">
              <span>{editingId ? 'Mudando a nota' : `${queue.length} ${queue.length === 1 ? 'título' : 'títulos'} para avaliar`}</span>
              {allRated.length > 0 && (
                <button className="link-btn" onClick={() => ratedRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                  Avaliados {allRated.length} <ChevronDown size={14} />
                </button>
              )}
            </p>
            <div className="deck" ref={deckRef}>
              {nextMedia && (
                <div className="swipe-card under" key={`under-${nextMedia.id}`} aria-hidden>
                  <MediaCard media={nextMedia} showDetails={false} />
                </div>
              )}
              <SwipeCard
                key={cardKey}
                ref={cardRef}
                className={returning === current.mediaId ? 'returning' : undefined}
                classify={classify}
                styles={editingId ? EDIT_STYLES : RATE_STYLES}
                onAction={onAction}
                onProgress={onProgress}
                onPreview={(a) => setAim(a && a !== 'skip' ? Number(a) : null)}
                onTap={() => setDetails((d) => !d)}
                onDoubleTap={confirm}
              >
                <MediaCard
                  media={currentMedia}
                  showDetails={details}
                  note={
                    highlighted !== null ? (
                      <p className="card-note" style={{ ['--s' as string]: highlighted }}>
                        {current.favorite && <Star className="fav-star" size={13} fill="currentColor" />}
                        {editingId ? 'Nota atual' : 'Sugestão'} <strong>{highlighted}</strong>
                      </p>
                    ) : current.favorite ? (
                      <p className="card-note">
                        <Star className="fav-star" size={13} fill="currentColor" /> Favorito
                      </p>
                    ) : undefined
                  }
                  hint={
                    highlighted !== null
                      ? `Arraste até a nota · 2 toques: confirma ${highlighted} · toque: sinopse`
                      : 'Arraste até a nota · toque: sinopse'
                  }
                />
              </SwipeCard>
            </div>
            {showPad ? (
              <div className="pad">
                {PAD.map((cell) => {
                  if (typeof cell === 'number') {
                    return (
                      <button
                        key={cell}
                        className={`pad-btn rate-btn${cell === highlighted ? ' is-suggested' : ''}${cell === aim ? ' is-aim' : ''}`}
                        style={{ ['--s' as string]: cell }}
                        aria-label={`Nota ${cell}`}
                        onClick={() => cardRef.current?.fling(keyOf(cell))}
                      >
                        <Star fill="currentColor" strokeWidth={0} /> {cell}
                      </button>
                    )
                  }
                  if (cell === 'undo') {
                    return (
                      <button key={cell} className="pad-btn quiet" disabled={!canUndo} onClick={doUndo}>
                        <Undo2 /> Desfazer
                      </button>
                    )
                  }
                  if (cell === 'skip') {
                    return (
                      <button key={cell} className="pad-btn quiet" onClick={() => cardRef.current?.fling('skip')}>
                        <ChevronLeft /> {skipLabel}
                      </button>
                    )
                  }
                  if (cell === 'confirm') {
                    return (
                      <button
                        key={cell}
                        className={`pad-btn${highlighted === null ? ' quiet' : ''}`}
                        style={{ ['--c' as string]: '#4ade80' }}
                        disabled={highlighted === null}
                        onClick={confirm}
                      >
                        <Check /> {highlighted === null ? 'Confirmar' : `Confirmar ${highlighted}`}
                      </button>
                    )
                  }
                  return (
                    <button key={cell} className="pad-btn quiet" onClick={togglePad} title="Usar só gestos">
                      <EyeOff /> Ocultar
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="pad-compact">
                <button className="pad-btn quiet" onClick={() => cardRef.current?.fling('skip')}>
                  <ChevronLeft /> {skipLabel}
                </button>
                <button className="pad-btn quiet" disabled={!canUndo} onClick={doUndo}>
                  <Undo2 /> Desfazer
                </button>
                <button className="pad-btn quiet" onClick={togglePad}>
                  <Eye /> Mostrar botões
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p className="empty-icon" aria-hidden>
              ⭐
            </p>
            <h2>Tudo avaliado</h2>
            <p>O que você marcar como já visto aparece aqui para receber nota de 1 a 8, arrastando na direção da nota.</p>
            {canUndo && (
              <button onClick={doUndo}>
                <Undo2 size={16} /> Desfazer
              </button>
            )}
          </div>
        )}
      </div>

      {allRated.length > 0 && (
        <section ref={ratedRef} className="rated">
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
