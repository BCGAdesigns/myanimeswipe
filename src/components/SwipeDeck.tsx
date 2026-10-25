import {
  Bookmark,
  Check,
  Clock3,
  Eye,
  EyeOff,
  Heart,
  LogOut,
  Pause,
  Play,
  Star,
  ThumbsDown,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { classifySwipe } from '../logic'
import { useStore } from '../store'
import type { Entry, SwipeAction } from '../types'
import { MediaCard, preloadCover } from './MediaCard'
import { SwipeCard, type ActionStyle, type SwipeCardHandle } from './SwipeCard'

export const ACTION_ICONS: Record<SwipeAction, LucideIcon> = {
  want: Bookmark,
  watching: Play,
  seen: Check,
  disliked: ThumbsDown,
  reject: X,
  dropped: LogOut,
  skip: Clock3,
  paused: Pause,
  liked: Heart,
  favorite: Star,
}

const style = (
  action: SwipeAction,
  text: string,
  color: string,
  vector: [number, number],
  burst?: ActionStyle['burst'],
): ActionStyle => {
  const Icon = ACTION_ICONS[action]
  return { text, color, vector, burst, icon: <Icon strokeWidth={2.6} /> }
}

export const ACTION_STYLES: Record<SwipeAction, ActionStyle> = {
  want: style('want', 'QUERO VER', '#60a5fa', [0, -1]),
  watching: style('watching', 'ASSISTINDO', '#2dd4bf', [0.71, -0.71]),
  seen: style('seen', 'JÁ VI', '#a78bfa', [1, 0]),
  disliked: style('disliked', 'NÃO GOSTEI', '#fb923c', [0.71, 0.71]),
  reject: style('reject', 'NÃO QUERO', '#f87171', [0, 1]),
  dropped: style('dropped', 'LARGUEI', '#fb7185', [-0.71, 0.71]),
  skip: style('skip', 'PULAR', '#9ca3af', [-1, 0]),
  paused: style('paused', 'EM PAUSA', '#38bdf8', [-0.71, -0.71]),
  liked: style('liked', 'GOSTEI', '#4ade80', [0.5, -0.87], { emoji: '❤️', caption: 'Gostei!', holdMs: 750 }),
  favorite: style('favorite', 'FAVORITO', '#facc15', [0, -1], { emoji: '⭐', caption: 'Amei! Favorito', holdMs: 950 }),
}

export const ACTION_LABEL: Record<SwipeAction, string> = {
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

interface Props {
  ids: string[]
  via: Entry['via']
  empty: ReactNode
  /** Shown above the deck (errors from one source, status lines). */
  banner?: ReactNode
  /** Recommendation reason per media id. */
  reasons?: Record<string, string>
}

export function SwipeDeck({ ids, via, empty, banner, reasons }: Props) {
  const { media, swipe, undo, canUndo } = useStore()
  const [details, setDetails] = useState(false)
  const [showPad, setShowPad] = useState(readShowPad)
  const [returning, setReturning] = useState<string | null>(null)
  const cardRef = useRef<SwipeCardHandle<SwipeAction>>(null)
  const deckRef = useRef<HTMLDivElement>(null)

  const togglePad = () => {
    writeShowPad(!showPad)
    setShowPad(!showPad)
  }

  const topId = ids[0]
  const top = topId ? media.get(topId) : undefined
  const below = ids[1] ? media.get(ids[1]) : undefined

  useEffect(() => setDetails(false), [topId])

  // The card that was behind is now on top; the new one behind starts small again.
  useLayoutEffect(() => {
    deckRef.current?.style.setProperty('--next', '0')
    deckRef.current?.classList.remove('dragging')
  }, [topId])

  const onProgress = useCallback((progress: number, dragging: boolean) => {
    const deck = deckRef.current
    if (!deck) return
    deck.style.setProperty('--next', String(progress))
    deck.classList.toggle('dragging', dragging)
  }, [])

  // Warm the image cache for the next few covers.
  useEffect(() => {
    for (const id of ids.slice(1, 4)) {
      const m = media.get(id)
      if (m) preloadCover(m.cover)
    }
  }, [ids, media])

  const doUndo = useCallback(() => {
    const id = undo()
    if (id) setReturning(id)
  }, [undo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
      // Keys belong to an open sheet, not to the cards behind it.
      if (e.metaKey || e.ctrlKey || document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'z') {
        doUndo()
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
  }, [doUndo])

  const commit = (mediaId: string, action: SwipeAction) => {
    // Celebrations already buzzed on the gesture.
    if (!ACTION_STYLES[action].burst) navigator.vibrate?.(8)
    swipe(mediaId, action, via)
  }

  return (
    <div className="deck-wrap">
      {banner}
      <div className="deck" ref={deckRef}>
        {below && (
          <div className="swipe-card under" key={`under-${below.id}`} aria-hidden>
            <MediaCard media={below} showDetails={false} reason={reasons?.[below.id]} />
          </div>
        )}
        {top ? (
          <SwipeCard
            key={top.id}
            ref={cardRef}
            className={returning === top.id ? 'returning' : undefined}
            classify={classifySwipe}
            styles={ACTION_STYLES}
            onAction={(a) => commit(top.id, a)}
            onProgress={onProgress}
            onTap={() => setDetails((d) => !d)}
            onDoubleTap={() => {
              navigator.vibrate?.(15)
              cardRef.current?.fling('liked')
            }}
            onLongPress={() => cardRef.current?.fling('favorite')}
          >
            <MediaCard media={top} showDetails={details} reason={reasons?.[top.id]} />
          </SwipeCard>
        ) : (
          <div className="deck-empty">{empty}</div>
        )}
      </div>
      {/* Gesture-only mode keeps undo reachable, since diagonal swipes are easy to miss. */}
      {!top ? (
        canUndo && (
          <div className="pad-compact center">
            <button className="pad-btn quiet" onClick={doUndo}>
              <Undo2 /> Desfazer
            </button>
          </div>
        )
      ) : showPad ? (
        <div className="pad">
          {PAD.map((cell) => {
            if (cell === 'hide') {
              return (
                <button key={cell} className="pad-btn quiet" onClick={togglePad} title="Usar só gestos">
                  <EyeOff /> Ocultar
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
            const Icon = ACTION_ICONS[cell]
            return (
              <button
                key={cell}
                className="pad-btn"
                style={{ ['--c' as string]: ACTION_STYLES[cell].color }}
                disabled={!top}
                onClick={() => cardRef.current?.fling(cell)}
              >
                <Icon strokeWidth={2.4} /> {ACTION_LABEL[cell]}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="pad-compact">
          <button className="pad-btn quiet" disabled={!canUndo} onClick={doUndo}>
            <Undo2 /> Desfazer
          </button>
          <button className="pad-btn quiet" onClick={togglePad}>
            <Eye /> Mostrar botões
          </button>
        </div>
      )}
    </div>
  )
}
