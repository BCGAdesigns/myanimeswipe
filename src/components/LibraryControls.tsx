import { Check, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_VIEW, SORT_LABELS, type LibrarySort, type LibraryView } from '../library'
import { ALL_KINDS, KIND_LABELS } from '../prefs'
import { Sheet } from './Sheet'

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

/** Filters that hide titles (the order hides nothing), for the count on the button. */
const hidingFilters = (view: LibraryView) => (view.kind !== 'all' ? 1 : 0) + (view.favoritesOnly ? 1 : 0)

/** One compact button that says how the list is ordered and filtered; the choices open in a sheet. */
export function LibraryControls({ view, onChange, sorts, showFavorites }: Props) {
  const [open, setOpen] = useState(false)
  const count = hidingFilters(view)
  const summary = [SORT_LABELS[view.sort], view.kind !== 'all' && KIND_LABELS[view.kind], view.favoritesOnly && 'Favoritos']
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <button
        className={`filter-btn${count ? ' on' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`Ordenar e filtrar: ${summary}`}
      >
        <SlidersHorizontal />
        <span className="filter-summary">{summary}</span>
        {count > 0 && <span className="filter-count">{count}</span>}
      </button>
      {open && (
        <Sheet
          title="Ordenar e filtrar"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => onChange(DEFAULT_VIEW)}>Limpar</button>
              <button className="primary" onClick={() => setOpen(false)}>
                Pronto
              </button>
            </>
          }
        >
          <h4 className="title-section">Ordenar por</h4>
          <div className="option-list" role="radiogroup" aria-label="Ordenar por">
            {sorts.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={view.sort === s}
                className={`option${view.sort === s ? ' on' : ''}`}
                onClick={() => onChange({ ...view, sort: s })}
              >
                {SORT_LABELS[s]}
                {view.sort === s && <Check />}
              </button>
            ))}
          </div>
          <h4 className="title-section">Tipo</h4>
          <div className="chip-wrap">
            <button className={`chip${view.kind === 'all' ? ' on' : ''}`} onClick={() => onChange({ ...view, kind: 'all' })}>
              Todos
            </button>
            {ALL_KINDS.map((k) => (
              <button key={k} className={`chip${view.kind === k ? ' on' : ''}`} onClick={() => onChange({ ...view, kind: k })}>
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
          {showFavorites && (
            <label className="switch-row filter-switch">
              <span>Só favoritos</span>
              <input
                type="checkbox"
                role="switch"
                checked={view.favoritesOnly}
                onChange={(e) => onChange({ ...view, favoritesOnly: e.target.checked })}
              />
            </label>
          )}
        </Sheet>
      )}
    </>
  )
}
