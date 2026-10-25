import { useMemo, useRef, useState } from 'react'
import { classifyRateSwipe, rateQueue, ratedList } from '../logic'
import { useStore } from '../store'
import { metaLine } from './MediaCard'
import { SwipeCard, type ActionStyle, type SwipeCardHandle } from './SwipeCard'

type RateAction = 'confirm' | 'skip'

const RATE_STYLES: Record<RateAction, ActionStyle> = {
  confirm: { text: 'CONFIRMAR', color: '#22c55e', vector: [1, 0] },
  skip: { text: 'PULAR', color: '#9ca3af', vector: [-1, 0] },
}

const SCORES = Array.from({ length: 11 }, (_, i) => i)

export function RateTab() {
  const { entries, media, rate, skipRating, undo, canUndo } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const cardRef = useRef<SwipeCardHandle<RateAction>>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const queue = useMemo(() => rateQueue(entries), [entries])
  const rated = useMemo(() => ratedList(entries), [entries])

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
              {editingId ? 'Reavaliando' : `${queue.length} na fila`}
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
                  <img src={currentMedia.cover} alt="" draggable={false} />
                  <div>
                    <h2>{currentMedia.title}</h2>
                    <p className="meta">{metaLine(currentMedia)}</p>
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
                <button key={s} className={s === highlighted ? 'score active' : 'score'} onClick={() => pick(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="rate-actions">
              <button onClick={() => cardRef.current?.fling('skip')}>← {editingId ? 'Cancelar' : 'Pular'}</button>
              <button disabled={!canUndo} onClick={() => undo()}>
                ↺ Desfazer
              </button>
              <button disabled={highlighted === null} onClick={() => cardRef.current?.fling('confirm')}>
                Confirmar →
              </button>
            </div>
          </>
        ) : (
          <div className="notice">
            <p>Nada na fila. Os animes marcados como "já vi" aparecem aqui para receber nota.</p>
            {canUndo && <button onClick={() => undo()}>↺ Desfazer</button>}
          </div>
        )}
      </div>

      {rated.length > 0 && (
        <section className="rated">
          <h3>Avaliados ({rated.length})</h3>
          <ul>
            {rated.map((e) => {
              const m = media.get(e.mediaId)
              if (!m) return null
              return (
                <li key={e.mediaId}>
                  <button onClick={() => startEdit(e.mediaId)}>
                    <img src={m.cover} alt="" loading="lazy" />
                    <span className="rated-title">{m.title}</span>
                    <span className="rated-score">{e.rating}</span>
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
