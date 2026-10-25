import { Bookmark, Check, LogOut, Pause, Play, RotateCcw, Star, Trash, Undo2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { arrangeEntries } from '../library'
import { favoriteList, statusList } from '../logic'
import { useStore } from '../store'
import type { Entry, Media, SwipeAction } from '../types'
import { LibraryControls, usePersistentView } from './LibraryControls'
import { Cover, coverThumb, metaLine } from './MediaCard'
import { TitleSheet } from './TitleSheet'

type ListKind = 'want' | 'watching' | 'paused' | 'dropped' | 'favorite' | 'reject'

const LISTS: { kind: ListKind; label: string; icon: string; empty: string }[] = [
  { kind: 'want', label: 'Quero ver', icon: '🔖', empty: 'Nada aqui ainda. Arraste um cartão para cima (↑) para guardar o que quer ver.' },
  { kind: 'watching', label: 'Assistindo', icon: '▶️', empty: 'Arraste um cartão para cima e para a direita (↗) para marcar o que está assistindo.' },
  { kind: 'paused', label: 'Em pausa', icon: '⏸️', empty: 'Arraste um cartão para cima e para a esquerda (↖) para pausar.' },
  { kind: 'dropped', label: 'Larguei', icon: '🚪', empty: 'Arraste um cartão para baixo e para a esquerda (↙) para os que você largou.' },
  { kind: 'favorite', label: 'Favoritos', icon: '⭐', empty: 'Segure um cartão para marcar como favorito.' },
  { kind: 'reject', label: 'Não quero', icon: '🙅', empty: 'Os títulos arrastados para baixo (↓) aparecem aqui e podem ser restaurados.' },
]

interface ItemAction {
  label: string
  icon: ReactNode
  run: (e: Entry) => void
}

export function ListsTab() {
  const { entries, media, swipe, removeEntry, toggleFavorite, undo, canUndo } = useStore()
  const [kind, setKind] = useState<ListKind>('want')
  const [view, setView] = usePersistentView('lists')
  const [open, setOpen] = useState<Media | null>(null)

  const lists = useMemo<Record<ListKind, Entry[]>>(
    () => ({
      want: statusList(entries, 'want'),
      watching: statusList(entries, 'watching'),
      paused: statusList(entries, 'paused'),
      dropped: statusList(entries, 'dropped'),
      favorite: favoriteList(entries),
      reject: statusList(entries, 'reject'),
    }),
    [entries],
  )

  const move = (action: SwipeAction) => (e: Entry) => swipe(e.mediaId, action, e.via)
  const remove = (e: Entry) => removeEntry(e.mediaId)
  const actions: Record<ListKind, ItemAction[]> = {
    want: [
      { label: 'Comecei', icon: <Play />, run: move('watching') },
      { label: 'Já vi', icon: <Check />, run: move('seen') },
      { label: 'Remover', icon: <Trash />, run: remove },
    ],
    watching: [
      { label: 'Terminei', icon: <Check />, run: move('seen') },
      { label: 'Pausar', icon: <Pause />, run: move('paused') },
      { label: 'Larguei', icon: <LogOut />, run: move('dropped') },
    ],
    paused: [
      { label: 'Retomar', icon: <Play />, run: move('watching') },
      { label: 'Larguei', icon: <LogOut />, run: move('dropped') },
      { label: 'Remover', icon: <Trash />, run: remove },
    ],
    dropped: [
      { label: 'Retomar', icon: <Play />, run: move('watching') },
      { label: 'Remover', icon: <Trash />, run: remove },
    ],
    favorite: [{ label: 'Tirar dos favoritos', icon: <Star />, run: (e) => toggleFavorite(e.mediaId) }],
    reject: [
      { label: 'Restaurar', icon: <RotateCcw />, run: remove },
      { label: 'Quero ver', icon: <Bookmark />, run: move('want') },
    ],
  }

  const list = useMemo(() => arrangeEntries(lists[kind], media, view), [lists, kind, media, view])
  const current = LISTS.find((l) => l.kind === kind)!

  return (
    <div className="lists-tab">
      <div className="list-bar">
        <div className="chips">
          {LISTS.map((l) => (
            <button key={l.kind} className={kind === l.kind ? 'active' : ''} onClick={() => setKind(l.kind)}>
              {l.label}
              <span className="n">{lists[l.kind].length}</span>
            </button>
          ))}
        </div>
        <button className="icon-btn" disabled={!canUndo} onClick={() => undo()} aria-label="Desfazer" title="Desfazer">
          <Undo2 />
        </button>
      </div>

      {lists[kind].length > 0 && (
        <LibraryControls view={view} onChange={setView} sorts={['recent', 'title', 'year', 'score']} />
      )}

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
        <ul className="media-list">
          {list.map((e) => {
            const m = media.get(e.mediaId)
            if (!m) return null
            return (
              <li key={e.mediaId}>
                <button className="item-cover" onClick={() => setOpen(m)} aria-label={`Abrir ${m.title}`}>
                  <Cover src={coverThumb(m)} lazy />
                </button>
                <div className="item-body">
                  <button className="item-title" onClick={() => setOpen(m)}>
                    {e.favorite && <Star className="fav-star" size={14} fill="currentColor" />} {m.title}
                  </button>
                  <span className="meta">{metaLine(m, true)}</span>
                  {m.links.crunchyroll && (
                    <a className="cr-link" href={m.links.crunchyroll} target="_blank" rel="noreferrer">
                      Crunchyroll
                    </a>
                  )}
                  <div className="item-actions">
                    {actions[kind].map((a) => (
                      <button key={a.label} onClick={() => a.run(e)}>
                        {a.icon} {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {open && <TitleSheet media={open} via="discover" onClose={() => setOpen(null)} />}
    </div>
  )
}
