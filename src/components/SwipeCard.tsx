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
  icon?: ReactNode
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
  /** How far the card is toward a swipe (0 to 1) and whether a finger is on it; 1 once it leaves. */
  onProgress?: (progress: number, dragging: boolean) => void
  className?: string
  children: ReactNode
  ref?: Ref<SwipeCardHandle<T>>
}

const FLING_MS = 240
const EXIT_MS = 450
const SETTLE_MS = 380
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
  onProgress,
  className,
  children,
  ref,
}: Props<T>) {
  const el = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<T | null>(null)
  const [leaving, setLeaving] = useState<T | null>(null)
  const leavingRef = useRef<T | null>(null)
  const previewRef = useRef<T | null>(null)
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

  // Dragging writes the transform straight to the element: no React render per pointer move.
  const place = (x: number, y: number, transition: string) => {
    const node = el.current
    if (!node) return
    node.style.transition = transition
    node.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0) rotate(${x / 20}deg)` : ''
    node.style.setProperty('--drag', String(Math.min(1, Math.hypot(x, y) / SWIPE_THRESHOLD)))
  }

  const showPreview = (action: T | null) => {
    if (previewRef.current === action) return
    previewRef.current = action
    setPreview(action)
  }

  const fling = (action: T) => {
    if (leavingRef.current) return
    leavingRef.current = action
    setLeaving(action)
    showPreview(action)
    const style = styles[action]
    const burst = style.burst
    if (burst) {
      place(0, 0, `transform ${SETTLE_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1)`)
      el.current?.style.setProperty('--drag', '1')
      el.current?.style.setProperty('--celebrate', style.color)
      exitTimers.current.push(
        window.setTimeout(() => {
          const node = el.current
          if (node) {
            node.style.transition = `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`
            node.style.transform = 'translateY(-24px) scale(0.94)'
            node.style.opacity = '0'
          }
          onProgress?.(1, false)
        }, burst.holdMs),
        window.setTimeout(() => onAction(action), burst.holdMs + EXIT_MS),
      )
      return
    }
    const [vx, vy] = style.vector
    const dist = Math.max(window.innerWidth, window.innerHeight) * 1.2
    place(vx * dist, vy * dist, `transform ${FLING_MS}ms cubic-bezier(0.4, 0, 0.9, 0.6)`)
    el.current?.style.setProperty('--drag', '1')
    onProgress?.(1, false)
    exitTimers.current.push(window.setTimeout(() => onAction(action), FLING_MS))
  }

  useImperativeHandle(ref, () => ({ fling }))

  const settle = () => {
    place(0, 0, `transform ${SETTLE_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1)`)
    showPreview(null)
    onProgress?.(0, false)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (leavingRef.current || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
    if (onLongPress) {
      pressTimer.current = window.setTimeout(() => {
        // The press is consumed here; the coming pointerup must not count as a tap or swipe.
        start.current = null
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
    const dist = Math.hypot(dx, dy)
    if (dist > STILL_PX) window.clearTimeout(pressTimer.current)
    place(dx, dy, 'none')
    showPreview(dist > 24 ? classify(dx, dy, 0) : null)
    onProgress?.(Math.min(1, dist / SWIPE_THRESHOLD), true)
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
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    const dist = Math.hypot(dx, dy)
    if (dist < STILL_PX) {
      place(0, 0, 'none')
      onProgress?.(0, false)
      tap()
      return
    }
    // A quick flick counts even when it is shorter than the threshold.
    const speed = dist / Math.max(1, performance.now() - s.t)
    const action = classify(dx, dy) ?? (dist > 40 && speed > 0.6 ? classify(dx, dy, 0) : null)
    if (action) fling(action)
    else settle()
  }

  const onPointerCancel = () => {
    window.clearTimeout(pressTimer.current)
    start.current = null
    settle()
  }

  const style = preview ? styles[preview] : null
  const burst = leaving ? styles[leaving].burst : undefined

  return (
    <div
      ref={el}
      className={`swipe-card${burst ? ' celebrating' : ''}${className ? ` ${className}` : ''}`}
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
          <div className="swipe-label" style={{ borderColor: style.color, color: style.color }}>
            {style.icon}
            {style.text}
          </div>
        )
      )}
    </div>
  )
}
