import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Extra class on the panel, e.g. "tall" for a sheet that always uses the full height. */
  className?: string
  /** Replaces the default title row (search puts its input there). */
  head?: ReactNode
}

/** Bottom sheet dialog: backdrop tap and Escape close it; with sheets stacked, only the top one. */
export function Sheet({ title, onClose, children, footer, className, head }: Props) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const open = document.querySelectorAll('[aria-modal="true"]')
      if (open[open.length - 1] === panel.current) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panel}
        className={`sheet${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        {head ?? (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" aria-label="Fechar" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}
