import { useMemo, useState } from 'react'
import { favoriteList, statusList } from '../logic'
import { useStore } from '../store'
import type { Entry, SwipeAction } from '../types'
import { metaLine } from './MediaCard'

type ListKind = 'want' | 'watching' | 'paused' | 'dropped' | 'favorite' | 'reject'

const LISTS: { kind: ListKind; label: string; empty: string }[] = [
  { kind: 'want', label: 'Quero ver', empty: 'Nada aqui ainda. Arraste um card para cima (↑) para guardar o que quer ver.' },
  { kind: 'watching', label: 'Assistindo', empty: 'Arraste um card para cima e para a direita (↗) para marcar o que está assistindo.' },
  { kind: 'paused', label: 'Em pausa', empty: 'Arraste um card para cima e para a esquerda (↖) para pausar.' },
  { kind: 'dropped', label: 'Larguei', empty: 'Arraste um card para baixo e para a esquerda (↙) para os que você largou.' },
  { kind: 'favorite', label: 'Favoritos', empty: 'Segure um card para marcar como favorito.' },
  { kind: 'reject', label: 'Não quero', empty: 'Os animes arrastados para baixo (↓) aparecem aqui e podem ser restaurados.' },
]

interface ItemAction {
  label: string
  run: (e: Entry) => void
}

export function ListsTab() {
  const { entries, media, swipe, removeEntry, toggleFavorite, undo, canUndo } = useStore()
  const [kind, setKind] = useState<ListKind>('want')

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
      { label: '▶ Comecei', run: move('watching') },
      { label: '→ Já vi', run: move('seen') },
      { label: 'Remover', run: remove },
    ],
    watching: [
      { label: '→ Terminei', run: move('seen') },
      { label: '⏸ Pausar', run: move('paused') },
      { label: '↙ Larguei', run: move('dropped') },
    ],
    paused: [
      { label: '▶ Retomar', run: move('watching') },
      { label: '↙ Larguei', run: move('dropped') },
      { label: 'Remover', run: remove },
    ],
    dropped: [
      { label: '▶ Retomar', run: move('watching') },
      { label: 'Remover', run: remove },
    ],
    favorite: [{ label: 'Tirar dos favoritos', run: (e) => toggleFavorite(e.mediaId) }],
    reject: [
      { label: 'Restaurar', run: remove },
      { label: '↑ Quero ver', run: move('want') },
    ],
  }

  const list = lists[kind]
  const current = LISTS.find((l) => l.kind === kind)!

  return (
    <div className="lists-tab">
      <div className="list-bar">
        <div className="chips">
          {LISTS.map((l) => (
            <button key={l.kind} className={kind === l.kind ? 'active' : ''} onClick={() => setKind(l.kind)}>
              {l.label} ({lists[l.kind].length})
            </button>
          ))}
        </div>
        <button className="undo-mini" disabled={!canUndo} onClick={() => undo()} aria-label="Desfazer">
          ↺
        </button>
      </div>

      {list.length === 0 ? (
        <p className="notice">{current.empty}</p>
      ) : (
        <ul className="media-list">
          {list.map((e) => {
            const m = media.get(e.mediaId)
            if (!m) return null
            return (
              <li key={e.mediaId}>
                <img src={m.cover} alt="" loading="lazy" />
                <div className="item-body">
                  <a className="item-title" href={m.links.site ?? m.links.mal} target="_blank" rel="noreferrer">
                    {e.favorite && '⭐ '}
                    {m.title}
                  </a>
                  <span className="meta">{metaLine(m)}</span>
                  {m.links.crunchyroll && (
                    <a className="cr-link" href={m.links.crunchyroll} target="_blank" rel="noreferrer">
                      Crunchyroll
                    </a>
                  )}
                  <div className="item-actions">
                    {actions[kind].map((a) => (
                      <button key={a.label} onClick={() => a.run(e)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
