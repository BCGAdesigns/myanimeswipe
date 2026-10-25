import { Check, ChevronDown, ChevronRight, Star, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { arrangeEntries, type LibrarySort } from '../library'
import { favoriteList, statusList } from '../logic'
import { toStars } from '../rating'
import { useStore } from '../store'
import type { Entry, Media } from '../types'
import { LibraryControls, usePersistentView } from './LibraryControls'
import { Cover, coverThumb, metaLine } from './MediaCard'
import { Sheet } from './Sheet'
import { TitleSheet } from './TitleSheet'

type ListKind = 'want' | 'watching' | 'paused' | 'seen' | 'favorite' | 'dropped' | 'reject'

const LISTS: { kind: ListKind; label: string; icon: string; empty: string }[] = [
  { kind: 'want', label: 'Quero ver', icon: '🔖', empty: 'Nada aqui ainda. Arraste um cartão para cima (↑) para guardar o que quer ver.' },
  { kind: 'watching', label: 'Assistindo', icon: '▶️', empty: 'Arraste um cartão para cima e para a direita (↗) para marcar o que está assistindo.' },
  { kind: 'paused', label: 'Em pausa', icon: '⏸️', empty: 'Arraste um cartão para cima e para a esquerda (↖) para pausar.' },
  { kind: 'seen', label: 'Já vi', icon: '✅', empty: 'O que você marcar como já visto fica aqui, com a nota.' },
  { kind: 'favorite', label: 'Favoritos', icon: '⭐', empty: 'Dê nota 9 a um título, ou segure um cartão no Descobrir, para ter favoritos.' },
  { kind: 'dropped', label: 'Larguei', icon: '🚪', empty: 'Arraste um cartão para baixo e para a esquerda (↙) para os que você largou.' },
  { kind: 'reject', label: 'Não quero', icon: '🙅', empty: 'Os títulos arrastados para baixo (↓) aparecem aqui.' },
]

const LIST_KEY = 'watchmatch:list'

function readList(): ListKind {
  try {
    const saved = localStorage.getItem(LIST_KEY)
    return LISTS.some((l) => l.kind === saved) ? (saved as ListKind) : 'want'
  } catch {
    return 'want'
  }
}

function writeList(kind: ListKind) {
  try {
    localStorage.setItem(LIST_KEY, kind)
  } catch {
    // Opens on Quero ver next time.
  }
}

/** Lists with ratings also sort by them. */
const sortsFor = (kind: ListKind): LibrarySort[] =>
  kind === 'seen' || kind === 'favorite' ? ['recent', 'rating-desc', 'rating-asc', 'title', 'year', 'score'] : ['recent', 'title', 'year', 'score']

/** The rating, or where a seen title stands without one. */
function RowEnd({ e }: { e: Entry }) {
  if (e.status !== 'seen') return null
  if (e.rating === null) return <span className="take-chip">sem nota</span>
  const stars = toStars(e.rating)
  return (
    <span className="rated-score" style={{ ['--s' as string]: stars }}>
      {stars}
    </span>
  )
}

export function ListsTab() {
  const { entries, media, undo, canUndo } = useStore()
  const [kind, setKindState] = useState<ListKind>(readList)
  const [view, setView] = usePersistentView('lists')
  const [picking, setPicking] = useState(false)
  const [open, setOpen] = useState<Media | null>(null)

  const setKind = (next: ListKind) => {
    writeList(next)
    setKindState(next)
  }

  const lists = useMemo<Record<ListKind, Entry[]>>(
    () => ({
      want: statusList(entries, 'want'),
      watching: statusList(entries, 'watching'),
      paused: statusList(entries, 'paused'),
      seen: statusList(entries, 'seen'),
      favorite: favoriteList(entries),
      dropped: statusList(entries, 'dropped'),
      reject: statusList(entries, 'reject'),
    }),
    [entries],
  )

  // A rating sort picked on Já vi falls back to the most recent on lists without ratings.
  const sorts = sortsFor(kind)
  const shown = useMemo(() => (sortsFor(kind).includes(view.sort) ? view : { ...view, sort: 'recent' as const }), [kind, view])
  const list = useMemo(() => arrangeEntries(lists[kind], media, shown), [lists, kind, media, shown])
  const current = LISTS.find((l) => l.kind === kind)!

  return (
    <div className="lists-tab">
      <div className="list-head">
        <button className="list-picker" onClick={() => setPicking(true)} aria-label={`Lista: ${current.label}. Trocar de lista`}>
          <span aria-hidden>{current.icon}</span>
          <span className="list-picker-label">{current.label}</span>
          <span className="n">{lists[kind].length}</span>
          <ChevronDown />
        </button>
        <LibraryControls view={shown} onChange={setView} sorts={sorts} />
        <button className="icon-btn" disabled={!canUndo} onClick={() => undo()} aria-label="Desfazer" title="Desfazer">
          <Undo2 />
        </button>
      </div>

      {lists[kind].length > 0 && list.length === 0 ? (
        <p className="muted small">Nenhum título desse tipo nesta lista.</p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <p className="empty-icon" aria-hidden>
            {current.icon}
          </p>
          <p>{current.empty}</p>
        </div>
      ) : (
        <ul className="title-list">
          {list.map((e) => {
            const m = media.get(e.mediaId)
            if (!m) return null
            return (
              <li key={e.mediaId}>
                <button onClick={() => setOpen(m)}>
                  <Cover src={coverThumb(m)} lazy />
                  <span className="rated-title">
                    <span>
                      {e.favorite && <Star className="fav-star" size={13} fill="currentColor" />} {m.title}
                    </span>
                    <small>{metaLine(m, true)}</small>
                  </span>
                  <RowEnd e={e} />
                  <ChevronRight className="friend-go-icon" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {picking && (
        <Sheet title="Suas listas" onClose={() => setPicking(false)}>
          <ul className="list-options">
            {LISTS.map((l) => (
              <li key={l.kind}>
                <button
                  className={kind === l.kind ? 'on' : ''}
                  aria-pressed={kind === l.kind}
                  onClick={() => {
                    setKind(l.kind)
                    setPicking(false)
                  }}
                >
                  <span className="list-option-icon" aria-hidden>
                    {l.icon}
                  </span>
                  <span className="list-option-label">{l.label}</span>
                  <span className="n">{lists[l.kind].length}</span>
                  {kind === l.kind && <Check />}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {open && <TitleSheet media={open} via="discover" onClose={() => setOpen(null)} />}
    </div>
  )
}
