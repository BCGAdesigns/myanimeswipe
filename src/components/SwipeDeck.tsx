import { useEffect, useRef, useState, type ReactNode } from 'react'
import { classifySwipe } from '../logic'
import { useStore } from '../store'
import type { Entry, SwipeAction } from '../types'
import { MediaCard } from './MediaCard'
import { SwipeCard, type ActionStyle, type SwipeCardHandle } from './SwipeCard'

export const ACTION_STYLES: Record<SwipeAction, ActionStyle & { icon: string }> = {
  want: { text: 'QUERO VER', color: '#3b82f6', vector: [0, -1], icon: '↑' },
  watching: { text: 'ASSISTINDO', color: '#14b8a6', vector: [0.71, -0.71], icon: '↗' },
  seen: { text: 'JÁ VI', color: '#a78bfa', vector: [1, 0], icon: '→' },
  disliked: { text: 'NÃO GOSTEI', color: '#f97316', vector: [0.71, 0.71], icon: '↘' },
  reject: { text: 'NÃO QUERO', color: '#ef4444', vector: [0, 1], icon: '↓' },
  dropped: { text: 'LARGUEI', color: '#fb7185', vector: [-0.71, 0.71], icon: '↙' },
  skip: { text: 'PULAR', color: '#9ca3af', vector: [-1, 0], icon: '←' },
  paused: { text: 'EM PAUSA', color: '#38bdf8', vector: [-0.71, -0.71], icon: '↖' },
  liked: {
    text: 'GOSTEI',
    color: '#22c55e',
    vector: [0.5, -0.87],
    icon: '♥',
    burst: { emoji: '❤️', caption: 'Gostei!', holdMs: 750 },
  },
  favorite: {
    text: 'FAVORITO',
    color: '#facc15',
    vector: [0, -1],
    icon: '⭐',
    burst: { emoji: '⭐', caption: 'Amei! Favorito', holdMs: 950 },
  },
}

const KEYS: Record<string, SwipeAction> = {
  ArrowUp: 'want',
  ArrowDown: 'reject',
  ArrowLeft: 'skip',
  ArrowRight: 'seen',
  a: 'watching',
  p: 'paused',
  l: 'dropped',
  n: 'disliked',
  g: 'liked',
  f: 'favorite',
}

// Pad that mirrors the compass, plus a row for the two touch gestures.
const PAD: (SwipeAction | 'undo' | 'hide')[] = [
  'paused', 'want', 'watching',
  'skip', 'undo', 'seen',
  'dropped', 'reject', 'disliked',
  'liked', 'favorite', 'hide',
]

// Per-device UI preference; storage can be unavailable (private mode), so default to visible.
const PAD_KEY = 'myanimeswipe:showPad'

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

const BUTTON_LABEL: Record<SwipeAction, string> = {
  want: 'Quero ver',
  reject: 'Não quero',
  skip: 'Pular',
  seen: 'Já vi',
  liked: 'Gostei',
  disliked: 'Não gostei',
  watching: 'Assistindo',
  paused: 'Em pausa',
  dropped: 'Larguei',
  favorite: 'Favorito',
}

interface Props {
  ids: string[]
  via: Entry['via']
  empty: ReactNode
}

export function SwipeDeck({ ids, via, empty }: Props) {
  const { media, swipe, undo, canUndo } = useStore()
  const [details, setDetails] = useState(false)
  const [showPad, setShowPad] = useState(readShowPad)
  const cardRef = useRef<SwipeCardHandle<SwipeAction>>(null)

  const togglePad = () => {
    writeShowPad(!showPad)
    setShowPad(!showPad)
  }

  const topId = ids[0]
  const top = topId ? media.get(topId) : undefined
  const below = ids[1] ? media.get(ids[1]) : undefined

  useEffect(() => setDetails(false), [topId])

  // Warm the image cache for the next few covers.
  useEffect(() => {
    for (const id of ids.slice(1, 4)) {
      const m = media.get(id)
      if (m) new Image().src = m.cover
    }
  }, [ids, media])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return
      if (e.key === 'z') {
        undo()
        return
      }
      const action = KEYS[e.key]
      if (action && cardRef.current) {
        e.preventDefault()
        cardRef.current.fling(action)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  return (
    <div className="deck-wrap">
      <div className="deck">
        {below && (
          <div className="swipe-card under" key={`under-${below.id}`}>
            <MediaCard media={below} showDetails={false} />
          </div>
        )}
        {top ? (
          <SwipeCard
            key={top.id}
            ref={cardRef}
            classify={classifySwipe}
            styles={ACTION_STYLES}
            onAction={(a) => swipe(top.id, a, via)}
            onTap={() => setDetails((d) => !d)}
            onDoubleTap={() => {
              navigator.vibrate?.(15)
              cardRef.current?.fling('liked')
            }}
            onLongPress={() => cardRef.current?.fling('favorite')}
          >
            <MediaCard media={top} showDetails={details} />
          </SwipeCard>
        ) : (
          <div className="deck-empty">{empty}</div>
        )}
      </div>
      {/* Gesture-only mode keeps undo reachable, since diagonal swipes are easy to miss. */}
      {showPad ? (
        <div className="pad">
          {PAD.map((cell, i) => {
            if (cell === 'hide') {
              return (
                <button key={i} className="pad-btn undo" onClick={togglePad}>
                  Ocultar
                </button>
              )
            }
            if (cell === 'undo') {
              return (
                <button key={i} className="pad-btn undo" disabled={!canUndo} onClick={() => undo()}>
                  ↺ Desfazer
                </button>
              )
            }
            const s = ACTION_STYLES[cell]
            return (
              <button
                key={i}
                className="pad-btn"
                style={{ color: s.color, borderColor: s.color }}
                disabled={!top}
                onClick={() => cardRef.current?.fling(cell)}
              >
                {s.icon} {BUTTON_LABEL[cell]}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="pad-compact">
          <button className="pad-btn undo" disabled={!canUndo} onClick={() => undo()}>
            ↺ Desfazer
          </button>
          <button className="pad-btn undo" onClick={togglePad}>
            Mostrar botões
          </button>
        </div>
      )}
    </div>
  )
}
