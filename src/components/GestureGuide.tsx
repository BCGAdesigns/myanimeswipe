import { Hand, Heart, Star } from 'lucide-react'
import { useEffect } from 'react'
import type { SwipeAction } from '../types'
import { ACTION_ICONS, ACTION_LABEL, ACTION_STYLES } from './SwipeDeck'

const COMPASS: SwipeAction[] = ['want', 'watching', 'seen', 'disliked', 'reject', 'dropped', 'skip', 'paused']
/** Distance from the center of the 300px compass to each label. */
const RADIUS = 118

const GUIDE_KEY = 'watchmatch:guideSeen'

export function guideSeen() {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1'
  } catch {
    return true
  }
}

function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_KEY, '1')
  } catch {
    // Shown again next time; harmless.
  }
}

/** The eight swipe directions around a card, plus the two touch gestures. */
export function GestureGuide({ onClose }: { onClose: () => void }) {
  const close = () => {
    markGuideSeen()
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        markGuideSeen()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="guide-backdrop" role="dialog" aria-modal="true" aria-label="Como usar os gestos">
      <div className="guide">
        <h2>Arraste para qualquer lado</h2>
        <p>Cada direção marca o título de um jeito. Os botões embaixo do cartão fazem o mesmo.</p>
        <div className="compass">
          <div className="compass-card">
            <Hand />
          </div>
          {COMPASS.map((action) => {
            const [vx, vy] = ACTION_STYLES[action].vector
            const Icon = ACTION_ICONS[action]
            return (
              <div
                key={action}
                className="compass-item"
                style={{ left: 150 + vx * RADIUS, top: 150 + vy * RADIUS, color: ACTION_STYLES[action].color }}
              >
                <Icon strokeWidth={2.4} />
                {ACTION_LABEL[action]}
              </div>
            )
          })}
        </div>
        <div className="guide-taps">
          <div>
            <Heart color={ACTION_STYLES.liked.color} />
            <span>
              Toque duas vezes
              <br />
              <span className="muted">Gostei</span>
            </span>
          </div>
          <div>
            <Star color={ACTION_STYLES.favorite.color} />
            <span>
              Segure o cartão
              <br />
              <span className="muted">Favorito</span>
            </span>
          </div>
        </div>
        <button className="primary big" onClick={close} autoFocus>
          Entendi
        </button>
      </div>
    </div>
  )
}
