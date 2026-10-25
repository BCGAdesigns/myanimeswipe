import { ArrowDownUp, Star } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_VIEW, SORT_LABELS, type LibrarySort, type LibraryView } from '../library'
import { ALL_KINDS, KIND_LABELS } from '../prefs'

/** Sort and filter choice per list, remembered on this device. */
export function usePersistentView(key: string, fallback: LibraryView = DEFAULT_VIEW) {
  const storageKey = `watchmatch:view:${key}`
  const [view, setView] = useState<LibraryView>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      return saved && typeof saved === 'object' ? { ...fallback, ...saved } : fallback
    } catch {
      return fallback
    }
  })
  const update = (next: LibraryView) => {
    setView(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Not remembered; still applied.
    }
  }
  return [view, update] as const
}

interface Props {
  view: LibraryView
  onChange: (view: LibraryView) => void
  sorts: LibrarySort[]
  showFavorites?: boolean
}

export function LibraryControls({ view, onChange, sorts, showFavorites }: Props) {
  return (
    <div className="lib-controls">
      <label className="sort-select">
        <ArrowDownUp />
        <select
          aria-label="Ordenar por"
          value={view.sort}
          onChange={(e) => onChange({ ...view, sort: e.target.value as LibrarySort })}
        >
          {sorts.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="chips mini">
        <button className={view.kind === 'all' ? 'active' : ''} onClick={() => onChange({ ...view, kind: 'all' })}>
          Todos
        </button>
        {ALL_KINDS.map((k) => (
          <button key={k} className={view.kind === k ? 'active' : ''} onClick={() => onChange({ ...view, kind: k })}>
            {KIND_LABELS[k]}
          </button>
        ))}
        {showFavorites && (
          <button
            className={view.favoritesOnly ? 'active' : ''}
            aria-pressed={view.favoritesOnly}
            onClick={() => onChange({ ...view, favoritesOnly: !view.favoritesOnly })}
          >
            <Star size={13} fill={view.favoritesOnly ? 'currentColor' : 'none'} /> Favoritos
          </button>
        )}
      </div>
    </div>
  )
}
