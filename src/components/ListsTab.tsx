import { useMemo, useState } from 'react'
import { statusList } from '../logic'
import { useStore } from '../store'
import type { EntryStatus } from '../types'
import { metaLine } from './MediaCard'

type ListKind = Extract<EntryStatus, 'want' | 'reject'>

const EMPTY: Record<ListKind, string> = {
  want: 'Nada aqui ainda. Arraste um card para cima para guardar o que quer ver.',
  reject: 'Nada aqui. Os animes arrastados para baixo aparecem aqui e podem ser restaurados.',
}

export function ListsTab() {
  const { entries, media, swipe, removeEntry, undo, canUndo } = useStore()
  const [kind, setKind] = useState<ListKind>('want')

  const want = useMemo(() => statusList(entries, 'want'), [entries])
  const reject = useMemo(() => statusList(entries, 'reject'), [entries])
  const list = kind === 'want' ? want : reject

  return (
    <div className="lists-tab">
      <div className="segmented">
        <button className={kind === 'want' ? 'active' : ''} onClick={() => setKind('want')}>
          Quero ver ({want.length})
        </button>
        <button className={kind === 'reject' ? 'active' : ''} onClick={() => setKind('reject')}>
          Não quero ({reject.length})
        </button>
        <button className="undo-mini" disabled={!canUndo} onClick={() => undo()} aria-label="Desfazer">
          ↺
        </button>
      </div>

      {list.length === 0 ? (
        <p className="notice">{EMPTY[kind]}</p>
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
                    {m.title}
                  </a>
                  <span className="meta">{metaLine(m)}</span>
                  {m.links.crunchyroll && (
                    <a className="cr-link" href={m.links.crunchyroll} target="_blank" rel="noreferrer">
                      Crunchyroll
                    </a>
                  )}
                  <div className="item-actions">
                    {kind === 'want' ? (
                      <>
                        <button onClick={() => swipe(e.mediaId, 'seen', e.via)}>→ Já vi</button>
                        <button onClick={() => removeEntry(e.mediaId)}>Remover</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => removeEntry(e.mediaId)}>Restaurar</button>
                        <button onClick={() => swipe(e.mediaId, 'want', e.via)}>↑ Quero ver</button>
                      </>
                    )}
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
