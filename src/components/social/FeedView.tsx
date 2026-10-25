import { Bookmark, Heart, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { FEED_PAGE, fetchFeed, toggleLike, type FeedItem, type Person } from '../../friends/api'
import { takeOf } from '../../friends/compare'
import { activityText, shortName, timeAgo } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import { useStore } from '../../store'
import type { Media } from '../../types'
import { Cover, coverThumb, metaLine } from '../MediaCard'
import { statusText, TitleSheet } from '../TitleSheet'
import { Avatar, errorText, TakeChip } from './parts'

interface Props {
  onOpenFriend: (p: Person) => void
  onGoFriends: () => void
}

const sameItem = (a: FeedItem, b: FeedItem) => a.userId === b.userId && a.mediaId === b.mediaId

export function FeedView({ onOpenFriend, onGoFriends }: Props) {
  const { friends, loaded, likes, likesSeenAt, markLikesSeen } = useSocial()
  const { entries, classify } = useStore()
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Media | null>(null)

  const load = useCallback(async (before?: number) => {
    setLoading(true)
    setError(null)
    try {
      const page = await fetchFeed(before)
      setItems((prev) => (before && prev ? [...prev, ...page.filter((p) => !prev.some((x) => sameItem(x, p)))] : page))
      setMore(page.length >= FEED_PAGE)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, friends.length])

  // New likes stay highlighted for a moment, then count as seen.
  const freshLikes = likes.filter((l) => (Date.parse(l.createdAt) || 0) > likesSeenAt).length
  useEffect(() => {
    if (!freshLikes) return
    const timer = window.setTimeout(markLikesSeen, 2500)
    return () => window.clearTimeout(timer)
  }, [freshLikes, markLikesSeen])

  const like = async (item: FeedItem) => {
    const flip = (i: FeedItem) => (sameItem(i, item) ? { ...i, liked: !i.liked, likes: Math.max(0, i.likes + (i.liked ? -1 : 1)) } : i)
    setItems((list) => list && list.map(flip))
    navigator.vibrate?.(8)
    try {
      await toggleLike(item.userId, item.mediaId)
    } catch (e) {
      setItems((list) => list && list.map(flip))
      setError(errorText(e))
    }
  }

  if (!loaded) return <div className="skeleton-line" aria-label="Carregando" />

  if (friends.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-icon" aria-hidden>
          <Users />
        </p>
        <h2>Seu feed começa com amigos</h2>
        <p>Adicione amigos para ver o que eles estão assistindo, curtir as notas deles e trocar recomendações.</p>
        <button className="primary" onClick={onGoFriends}>
          Adicionar amigos
        </button>
      </div>
    )
  }

  return (
    <div className="feed">
      {likes.length > 0 && (
        <section className="likes-strip" aria-label="Curtidas que você recebeu">
          <h4 className="title-section">Curtidas recentes</h4>
          <ul>
            {likes.slice(0, 6).map((l) => {
              const fresh = (Date.parse(l.createdAt) || 0) > likesSeenAt
              return (
                <li key={`${l.userId}:${l.mediaId}`} className={fresh ? 'fresh' : ''}>
                  <button className="likes-person" onClick={() => onOpenFriend(l)} aria-label={`Abrir perfil de ${shortName(l)}`}>
                    <Avatar person={l} size="sm" />
                  </button>
                  <span>
                    <strong>{shortName(l)}</strong> curtiu sua atividade em <em>{l.media?.title ?? 'um título'}</em>
                  </span>
                  <span className="feed-time">{timeAgo(l.createdAt)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {items === null ? (
        <div className="skeleton-line" aria-label="Carregando" />
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>Nada novo por aqui. Quando seus amigos classificarem títulos, aparece tudo neste feed.</p>
        </div>
      ) : (
        <ul className="feed-list">
          {items.map((item) => {
            const mine = entries.get(item.mediaId)
            const m = item.media
            return (
              <li key={`${item.userId}:${item.mediaId}`} className="feed-item">
                <p className="feed-line">
                  <button className="feed-person" onClick={() => onOpenFriend(item)}>
                    <Avatar person={item} size="sm" />
                    <strong>{shortName(item)}</strong>
                  </button>
                  <span>{activityText(item)}</span>
                  <span className="feed-time">{timeAgo(item.updatedAt)}</span>
                </p>
                {m && (
                  <button className="feed-media" onClick={() => setOpen(m)}>
                    <Cover src={coverThumb(m)} lazy />
                    <span className="media-row-body">
                      <span className="media-row-title">{m.title}</span>
                      <span className="media-row-meta">{metaLine(m, true)}</span>
                      {mine && <span className="media-row-status">Você: {statusText(mine)}</span>}
                    </span>
                    {(item.status === 'seen' || item.favorite) && (
                      <TakeChip take={takeOf(item)} />
                    )}
                  </button>
                )}
                <div className="feed-actions">
                  <button
                    className={`like-btn${item.liked ? ' on' : ''}`}
                    aria-pressed={item.liked}
                    aria-label={item.liked ? 'Descurtir' : 'Curtir'}
                    onClick={() => void like(item)}
                  >
                    <Heart fill={item.liked ? 'currentColor' : 'none'} />
                    {item.likes > 0 && <span>{item.likes}</span>}
                  </button>
                  {m && !mine && item.status !== 'want' && (
                    <button className="link-btn" onClick={() => classify(m, 'want', 'friend')}>
                      <Bookmark size={15} /> Quero ver
                    </button>
                  )}
                  {m && !mine && item.status === 'want' && (
                    <button className="link-btn" onClick={() => classify(m, 'want', 'friend')}>
                      <Bookmark size={15} /> Eu também quero
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {more && items && (
        <div className="row center">
          <button disabled={loading} onClick={() => void load(items[items.length - 1]?.updatedAt)}>
            {loading ? 'Carregando…' : 'Ver mais'}
          </button>
        </div>
      )}
      {error && <p className="message center">{error}</p>}
      {open && <TitleSheet media={open} via="friend" onClose={() => setOpen(null)} />}
    </div>
  )
}
