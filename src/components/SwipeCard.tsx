import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { SWIPE_THRESHOLD } from '../logic'

export interface SwipeCardHandle<T extends string> {
  fling: (action: T) => void
}

export interface ActionStyle {
  text: string
  color: string
  /** Fly-out direction, unit-ish vector (x right, y down). */
  vector: [number, number]
  /** Instead of flying off, celebrate on the card for `holdMs`, then fade out gently. */
  burst?: { emoji: string; caption: string; holdMs: number }
}

interface Props<T extends string> {
  classify: (dx: number, dy: number, threshold?: number) => T | null
  styles: Record<T, ActionStyle>
  onAction: (action: T) => void
  onTap?: () => void
  /** When set, a single tap waits DOUBLE_TAP_MS to tell it apart from a double tap. */
  onDoubleTap?: () => void
  onLongPress?: () => void
  children: ReactNode
  ref?: Ref<SwipeCardHandle<T>>
}

const FLING_MS = 220
const EXIT_MS = 450
const DOUBLE_TAP_MS = 250
const LONG_PRESS_MS = 500
/** Finger travel that still counts as holding still (long press) or tapping. */
const STILL_PX = 10

export function SwipeCard<T extends string>({
  classify,
  styles,
  onAction,
  onTap,
  onDoubleTap,
  onLongPress,
  children,
  ref,
}: Props<T>) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState<T | null>(null)
  const [exiting, setExiting] = useState(false)
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null)
  const lastTap = useRef(0)
  const tapTimer = useRef<number | undefined>(undefined)
  const pressTimer = useRef<number | undefined>(undefined)
  const exitTimers = useRef<number[]>([])

  useEffect(
    () => () => {
      window.clearTimeout(tapTimer.current)
      window.clearTimeout(pressTimer.current)
      exitTimers.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )

  const fling = (action: T) => {
    if (leaving) return
    setLeaving(action)
    const burst = styles[action].burst
    if (burst) {
      setPos({ x: 0, y: 0 })
      exitTimers.current.push(
        window.setTimeout(() => setExiting(true), burst.holdMs),
        window.setTimeout(() => onAction(action), burst.holdMs + EXIT_MS),
      )
      return
    }
    const [vx, vy] = styles[action].vector
    const dist = Math.max(window.innerWidth, window.innerHeight) * 1.2
    setPos({ x: vx * dist, y: vy * dist })
    exitTimers.current.push(window.setTimeout(() => onAction(action), FLING_MS))
  }

  useImperativeHandle(ref, () => ({ fling }))

  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
    setDragging(true)
    if (onLongPress) {
      pressTimer.current = window.setTimeout(() => {
        // The press is consumed here; the coming pointerup must not count as a tap or swipe.
        start.current = null
        setDragging(false)
        navigator.vibrate?.(30)
        onLongPress()
      }, LONG_PRESS_MS)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.hypot(dx, dy) > STILL_PX) window.clearTimeout(pressTimer.current)
    setPos({ x: dx, y: dy })
  }

  const tap = () => {
    const now = performance.now()
    if (onDoubleTap && now - lastTap.current < DOUBLE_TAP_MS) {
      window.clearTimeout(tapTimer.current)
      lastTap.current = 0
      onDoubleTap()
      return
    }
    lastTap.current = now
    if (onDoubleTap) tapTimer.current = window.setTimeout(() => onTap?.(), DOUBLE_TAP_MS)
    else onTap?.()
  }

  const onPointerUp = (e: React.PointerEvent) => {
    window.clearTimeout(pressTimer.current)
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    start.current = null
    setDragging(false)
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    const dist = Math.hypot(dx, dy)
    if (dist < STILL_PX) {
      setPos({ x: 0, y: 0 })
      tap()
      return
    }
    // A quick flick counts even when it is shorter than the threshold.
    const speed = dist / Math.max(1, performance.now() - s.t)
    const action = classify(dx, dy) ?? (dist > 40 && speed > 0.6 ? classify(dx, dy, 0) : null)
    if (action) fling(action)
    else setPos({ x: 0, y: 0 })
  }

  const onPointerCancel = () => {
    window.clearTimeout(pressTimer.current)
    start.current = null
    setDragging(false)
    setPos({ x: 0, y: 0 })
  }

  const preview = leaving ?? (Math.hypot(pos.x, pos.y) > 24 ? classify(pos.x, pos.y, 0) : null)
  const previewOpacity = leaving ? 1 : Math.min(1, Math.hypot(pos.x, pos.y) / SWIPE_THRESHOLD)
  const style = preview ? styles[preview] : null
  const burst = leaving ? styles[leaving].burst : undefined

  return (
    <div
      className={`swipe-card${burst ? ' celebrating' : ''}${exiting ? ' exiting' : ''}`}
      style={{
        transform: exiting
          ? 'translateY(-24px) scale(0.94)'
          : `translate(${pos.x}px, ${pos.y}px) rotate(${pos.x / 18}deg)`,
        transition: dragging
          ? 'none'
          : exiting
            ? `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`
            : `transform ${FLING_MS}ms ease-out`,
        ['--celebrate' as string]: burst ? style?.color : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      // Long press must not open the browser's context menu.
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      {burst ? (
        <div className="burst">
          <span className="burst-emoji">{burst.emoji}</span>
          <span className="burst-caption" style={{ color: style?.color }}>
            {burst.caption}
          </span>
        </div>
      ) : (
        style && (
          <div className="swipe-label" style={{ opacity: previewOpacity, borderColor: style.color, color: style.color }}>
            {style.text}
          </div>
        )
      )}
    </div>
  )
}
