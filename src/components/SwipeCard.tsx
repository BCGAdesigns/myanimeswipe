import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { SWIPE_THRESHOLD } from '../logic'

export interface SwipeCardHandle<T extends string> {
  fling: (action: T) => void
}

export interface ActionStyle {
  text: string
  color: string
  /** Fly-out direction, unit-ish vector (x right, y down). */
  vector: [number, number]
}

interface Props<T extends string> {
  classify: (dx: number, dy: number, threshold?: number) => T | null
  styles: Record<T, ActionStyle>
  onAction: (action: T) => void
  onTap?: () => void
  children: ReactNode
  ref?: Ref<SwipeCardHandle<T>>
}

const FLING_MS = 220

export function SwipeCard<T extends string>({ classify, styles, onAction, onTap, children, ref }: Props<T>) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState<T | null>(null)
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null)

  const fling = (action: T) => {
    if (leaving) return
    const [vx, vy] = styles[action].vector
    const dist = Math.max(window.innerWidth, window.innerHeight) * 1.2
    setLeaving(action)
    setPos({ x: vx * dist, y: vy * dist })
    window.setTimeout(() => onAction(action), FLING_MS)
  }

  useImperativeHandle(ref, () => ({ fling }))

  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    setPos({ x: e.clientX - s.x, y: e.clientY - s.y })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    start.current = null
    setDragging(false)
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    const dist = Math.hypot(dx, dy)
    if (dist < 6) {
      setPos({ x: 0, y: 0 })
      onTap?.()
      return
    }
    // A quick flick counts even when it is shorter than the threshold.
    const speed = dist / Math.max(1, performance.now() - s.t)
    const action = classify(dx, dy) ?? (dist > 40 && speed > 0.6 ? classify(dx, dy, 0) : null)
    if (action) fling(action)
    else setPos({ x: 0, y: 0 })
  }

  const onPointerCancel = () => {
    start.current = null
    setDragging(false)
    setPos({ x: 0, y: 0 })
  }

  const preview = leaving ?? (Math.hypot(pos.x, pos.y) > 24 ? classify(pos.x, pos.y, 0) : null)
  const previewOpacity = leaving ? 1 : Math.min(1, Math.hypot(pos.x, pos.y) / SWIPE_THRESHOLD)
  const style = preview ? styles[preview] : null

  return (
    <div
      className="swipe-card"
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px) rotate(${pos.x / 18}deg)`,
        transition: dragging ? 'none' : `transform ${FLING_MS}ms ease-out`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {children}
      {style && (
        <div className="swipe-label" style={{ opacity: previewOpacity, borderColor: style.color, color: style.color }}>
          {style.text}
        </div>
      )}
    </div>
  )
}
