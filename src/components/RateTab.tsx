import { Check, ChevronLeft, Star, Undo2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { arrangeEntries } from '../library'
import { classifyRateSwipe, rateQueue, ratedList } from '../logic'
import { useStore } from '../store'
import { LibraryControls, usePersistentView } from './LibraryControls'
import { Cover, coverThumb, metaLine } from './MediaCard'
import { SwipeCard, type ActionStyle, type SwipeCardHandle } from './SwipeCard'

type RateAction = 'confirm' | 'skip'

const RATE_STYLES: Record<RateAction, ActionStyle> = {
  confirm: { text: 'CONFIRMAR', color: '#4ade80', vector: [1, 0], icon: <Check strokeWidth={2.6} /> },
  skip: { text: 'PULAR', color: '#9ca3af', vector: [-1, 0], icon: <ChevronLeft strokeWidth={2.6} /> },
}

const SCORES = Array.from({ length: 11 }, (_, i) => i)

export function RateTab() {
  const { entries, media, rate, skipRating, undo, canUndo } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const cardRef = useRef<SwipeCardHandle<RateAction>>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const [view, setView] = usePersistentView('rated')
  const queue = useMemo(() => rateQueue(entries), [entries])
  const allRated = useMemo(() => ratedList(entries), [entries])
  const rated = useMemo(() => arrangeEntries(allRated, media, view), [allRated, media, view])

  const current = editingId ? entries.get(editingId) : queue[0]
  const currentMedia = current ? media.get(current.mediaId) : undefined
  const highlighted = current ? (editingId ? current.rating : null) ?? current.suggestedRating : null

  // Right swipe only confirms when there is a highlighted score to confirm.
  const classify = (dx: number, dy: number, threshold?: number) => {
    const a = classifyRateSwipe(dx, dy, threshold)
    return a === 'confirm' && highlighted === null ? null : a
  }

  const onAction = (a: RateAction) => {
    if (!current) return
    if (a === 'confirm' && highlighted !== null) rate(current.mediaId, highlighted)
    else if (a === 'skip' && !editingId) skipRating(current.mediaId)
    setEditingId(null)
  }

  const pick = (score: number) => {
    if (!current) return
    rate(current.mediaId, score)
    setEditingId(null)
  }

  const startEdit = (id: string) => {
    setEditingId(id)
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="rate-tab">
      <div ref={topRef} className="rate-top">
        {current && currentMedia ? (
          <>
            <p className="rate-count">
              <span>{editingId ? 'Mudando a nota' : `${queue.length} ${queue.length === 1 ? 'título' : 'títulos'} para avaliar`}</span>
              <span>Arraste: → confirma, ← pula</span>
            </p>
            <div className="rate-deck">
              <SwipeCard
                key={`${current.mediaId}-${current.queuedAt}-${editingId ?? ''}`}
                ref={cardRef}
                classify={classify}
                styles={RATE_STYLES}
                onAction={onAction}
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
                        {editingId ? 'Nota atual' : 'Nota sugerida'}: <strong>{highlighted}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </SwipeCard>
            </div>
            <div className="score-grid">
              {SCORES.map((s) => (
                <button
                  key={s}
                  className={s === highlighted ? 'score active' : 'score'}
                  style={{ ['--s' as string]: s }}
                  aria-label={`Nota ${s}`}
                  onClick={() => pick(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="rate-actions">
              <button onClick={() => cardRef.current?.fling('skip')}>
                <ChevronLeft /> {editingId ? 'Cancelar' : 'Pular'}
              </button>
              <button disabled={!canUndo} onClick={() => undo()}>
                <Undo2 /> Desfazer
              </button>
              <button
                className={highlighted === null ? undefined : 'primary'}
                disabled={highlighted === null}
                onClick={() => cardRef.current?.fling('confirm')}
              >
                <Check /> Confirmar
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p className="empty-icon" aria-hidden>
              ⭐
            </p>
            <h2>Tudo avaliado</h2>
            <p>O que você marcar como já visto aparece aqui para receber nota de 0 a 10.</p>
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
              if (!m) return null
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
                    <span className="rated-score" style={{ ['--s' as string]: e.rating ?? 0 }}>
                      {e.rating}
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
