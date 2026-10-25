import { ExternalLink, Star, Trash } from 'lucide-react'
import { useState } from 'react'
import { genreLabel } from '../genres'
import { KIND_BADGES } from '../prefs'
import { useStore } from '../store'
import type { Entry, Media, SwipeAction } from '../types'
import { Cover, metaLine } from './MediaCard'
import { Sheet } from './Sheet'
import { ACTION_ICONS, ACTION_LABEL, ACTION_STYLES } from './SwipeDeck'

const SOURCE_NAME = { anilist: 'AniList', tmdb: 'TMDB' } as const
const SCORES = Array.from({ length: 11 }, (_, i) => i)

/** Where the title stands in the user's library, in one line. */
export function statusText(e: Entry): string {
  switch (e.status) {
    case 'seen': {
      if (e.rating !== null) return `Já vi · nota ${e.rating}`
      return e.suggestedRating !== null ? `Já vi · falta confirmar a nota (${e.suggestedRating})` : 'Já vi · sem nota'
    }
    case 'want':
      return 'Na lista Quero ver'
    case 'watching':
      return 'Assistindo'
    case 'paused':
      return 'Em pausa'
    case 'dropped':
      return 'Larguei'
    case 'reject':
      return 'Não quero'
    case 'skip':
      return 'Pulado no Descobrir'
  }
}

const UNSEEN_ACTIONS: SwipeAction[] = ['want', 'watching', 'seen', 'liked', 'favorite', 'disliked', 'paused', 'dropped', 'reject']
const SEEN_ACTIONS: SwipeAction[] = ['watching', 'want', 'paused', 'dropped', 'reject']

interface Props {
  media: Media
  /** Origin recorded on new entries. */
  via: Entry['via']
  onClose: () => void
}

/** Everything about one title, and every way to classify it, outside the swipe decks. */
export function TitleSheet({ media, via, onClose }: Props) {
  const { entries, classify, rate, removeEntry, toggleFavorite } = useStore()
  const entry = entries.get(media.id)
  const [more, setMore] = useState(false)
  const seen = entry?.status === 'seen'
  const actions = seen ? SEEN_ACTIONS : UNSEEN_ACTIONS
  const current = entry ? (entry.rating ?? entry.suggestedRating) : null

  const act = (action: SwipeAction) => {
    navigator.vibrate?.(8)
    classify(media, action, entry?.via ?? via)
  }

  return (
    <Sheet title={media.title} onClose={onClose}>
      <div className="title-hero">
        <Cover className="title-cover" src={media.cover} />
        <div className="title-info">
          <span className={`kind-badge kind-${media.kind}`}>{KIND_BADGES[media.kind]}</span>
          <h3>{media.title}</h3>
          {media.altTitle && <p className="alt-title">{media.altTitle}</p>}
          <p className="meta">{metaLine(media)}</p>
          {entry && (
            <p className="status-pill">
              {entry.favorite && <Star size={13} fill="currentColor" />}
              {statusText(entry)}
            </p>
          )}
        </div>
      </div>

      {media.genres.length > 0 && (
        <div className="genres">
          {media.genres.slice(0, 6).map((g) => (
            <span key={g}>{genreLabel(g)}</span>
          ))}
        </div>
      )}

      {media.synopsis && (
        <p className={`title-synopsis${more ? ' open' : ''}`} onClick={() => setMore(!more)}>
          {media.synopsis}
        </p>
      )}

      <div className="links">
        {media.links.site && (
          <a href={media.links.site} target="_blank" rel="noreferrer">
            {SOURCE_NAME[media.source]} <ExternalLink />
          </a>
        )}
        {media.links.mal && (
          <a href={media.links.mal} target="_blank" rel="noreferrer">
            MyAnimeList <ExternalLink />
          </a>
        )}
        {media.links.crunchyroll && (
          <a href={media.links.crunchyroll} target="_blank" rel="noreferrer">
            Crunchyroll <ExternalLink />
          </a>
        )}
      </div>

      {seen && (
        <>
          <h4 className="title-section">Sua nota</h4>
          <div className="score-grid">
            {SCORES.map((s) => (
              <button
                key={s}
                className={s === current ? 'score active' : 'score'}
                style={{ ['--s' as string]: s }}
                aria-label={`Nota ${s}`}
                onClick={() => rate(media.id, s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="row">
            <button onClick={() => toggleFavorite(media.id)}>
              <Star fill={entry?.favorite ? 'currentColor' : 'none'} />
              {entry?.favorite ? 'Tirar dos favoritos' : 'Favoritar'}
            </button>
          </div>
        </>
      )}

      <h4 className="title-section">{entry ? 'Mudar para' : 'Classificar'}</h4>
      <div className="pad title-actions">
        {actions.map((a) => {
          const Icon = ACTION_ICONS[a]
          const on = entry?.status === a && !['liked', 'favorite', 'seen', 'disliked'].includes(a)
          return (
            <button
              key={a}
              className={`pad-btn${on ? ' on' : ''}`}
              style={{ ['--c' as string]: ACTION_STYLES[a].color }}
              aria-pressed={on}
              onClick={() => act(a)}
            >
              <Icon strokeWidth={2.4} /> {ACTION_LABEL[a]}
            </button>
          )
        })}
      </div>

      {entry && (
        <div className="row center">
          <button className="link-btn danger-link" onClick={() => removeEntry(media.id)}>
            <Trash size={15} /> Tirar da minha biblioteca
          </button>
        </div>
      )}
    </Sheet>
  )
}
