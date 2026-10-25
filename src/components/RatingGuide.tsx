import { Star } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { FAVORITE_STARS, GRADES } from '../rating'

const GUIDE_KEY = 'watchmatch:ratingGuide'
/** Changes with the scale, so everyone reads the guide again when it changes. */
const GUIDE_VERSION = '9'

export function ratingGuideSeen() {
  try {
    return localStorage.getItem(GUIDE_KEY) === GUIDE_VERSION
  } catch {
    return true
  }
}

function markSeen() {
  try {
    localStorage.setItem(GUIDE_KEY, GUIDE_VERSION)
  } catch {
    // Shown again next time; harmless.
  }
}

interface Props {
  onClose: () => void
  /** The person's old ratings just went back to the queue: say so first. */
  rescaled?: boolean
}

/** What each rating means and when to give it, shown before the first rating and in the help. */
export function RatingGuide({ onClose, rescaled }: Props) {
  const start = useRef<HTMLButtonElement>(null)

  // Focus the button without scrolling to it: the guide opens at its top.
  useEffect(() => start.current?.focus({ preventScroll: true }), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      markSeen()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const close = () => {
    markSeen()
    onClose()
  }

  return (
    <div className="guide-backdrop scrolls" role="dialog" aria-modal="true" aria-label="Como dar nota">
      <div className="guide rating-guide">
        <h2>Como dar nota</h2>
        {rescaled && (
          <p className="guide-notice">
            As notas mudaram: agora vão de 1 a 9, e o 9 é o favorito. Suas notas antigas voltaram para a aba Avaliar como
            sugestão. Confirme ou mude cada uma.
          </p>
        )}
        <p>
          Arraste o título na direção da nota ou toque no botão dela. Use a escala toda: o 5 fica no meio, para o que foi só
          ok.
        </p>
        <ol className="grade-list">
          {GRADES.map((g) => (
            <li key={g.stars} style={{ ['--s' as string]: g.stars }}>
              <span className="grade-num" aria-label={`Nota ${g.stars}`}>
                {g.stars === FAVORITE_STARS && <Star fill="currentColor" strokeWidth={0} />}
                {g.stars}
              </span>
              <span className="grade-text">
                <strong>{g.label}</strong>
                <span>{g.when}</span>
              </span>
              <span className={`grade-move${g.move.length > 2 ? ' words' : ''}`}>{g.move}</span>
            </li>
          ))}
        </ol>
        <button ref={start} className="primary big" onClick={close}>
          Começar a avaliar
        </button>
      </div>
    </div>
  )
}
