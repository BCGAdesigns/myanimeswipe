import { Bookmark, Heart, MessageCircle, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  commentCounts,
  FEED_PAGE,
  fetchFeed,
  friendsComments,
  threadKey,
  toggleLike,
  type Comment,
  type FeedItem,
  type LikeReceived,
  type Person,
} from '../../friends/api'
import { takeOf, type Take } from '../../friends/compare'
import { activityText, mergeFeed, shortName, timeAgo } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import { useStore } from '../../store'
import type { Media } from '../../types'
import { Cover, coverThumb, metaLine } from '../MediaCard'
import { statusText, TitleSheet } from '../TitleSheet'
import { CommentThread } from './CommentThread'
import { Avatar, errorText, TakeChip } from './parts'

interface Props {
  onOpenFriend: (p: Person) => void
  onGoFriends: () => void
}

interface OpenThread {
  owner: Person
  media: Media
  take?: Take | null
}

type Notice = { kind: 'like'; at: number; like: LikeReceived } | { kind: 'comment'; at: number; comment: Comment }

const sameItem = (a: FeedItem, b: FeedItem) => a.userId === b.userId && a.mediaId === b.mediaId
const timeOf = (iso: string) => Date.parse(iso) || 0
const threadsOf = (items: FeedItem[]) => items.map((i) => ({ owner: i.userId, media: i.mediaId }))

export function FeedView({ onOpenFriend, onGoFriends }: Props) {
  const { friends, loaded, likes, comments: forMe, activitySeenAt, markActivitySeen, myId, me } = useSocial()
  const { entries, classify } = useStore()
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [said, setSaid] = useState<Comment[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [more, setMore] = useState({ items: false, said: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Media | null>(null)
  const [thread, setThread] = useState<OpenThread | null>(null)

  /** Friends' activity and what they said about titles; `before` pages back each stream. */
  const load = useCallback(async (before?: { items?: number; said?: number }) => {
    setLoading(true)
    setError(null)
    try {
      const [page, talk] = await Promise.all([
        !before || before.items ? fetchFeed(before?.items) : Promise.resolve(null),
        !before || before.said ? friendsComments(before?.said).catch(() => null) : Promise.resolve(null),
      ])
      if (page) {
        setItems((prev) => (before && prev ? [...prev, ...page.filter((p) => !prev.some((x) => sameItem(x, p)))] : page))
        setMore((m) => ({ ...m, items: page.length >= FEED_PAGE }))
        commentCounts(threadsOf(page))
          .then((found) => setCounts((c) => ({ ...c, ...found })))
          .catch(() => {})
      }
      if (talk) {
        setSaid((prev) => (before && prev.length ? [...prev, ...talk.filter((t) => !prev.some((x) => x.id === t.id))] : talk))
        setMore((m) => ({ ...m, said: talk.length >= FEED_PAGE }))
      } else if (!before) {
        setMore((m) => ({ ...m, said: false }))
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, friends.length])

  const rows = useMemo(() => (items ? mergeFeed(items, said, more) : []), [items, said, more])

  // Likes and comments for the user, newest first.
  const notices = useMemo<Notice[]>(
    () =>
      [
        ...likes.map((like): Notice => ({ kind: 'like', at: timeOf(like.createdAt), like })),
        ...forMe.map((comment): Notice => ({ kind: 'comment', at: timeOf(comment.createdAt), comment })),
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, 6),
    [likes, forMe],
  )

  // New ones stay highlighted for a moment, then count as seen.
  const fresh = notices.filter((n) => n.at > activitySeenAt).length
  useEffect(() => {
    if (!fresh) return
    const timer = window.setTimeout(markActivitySeen, 2500)
    return () => window.clearTimeout(timer)
  }, [fresh, markActivitySeen])

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

  /** The person whose conversation a comment is in. */
  const ownerOf = (c: Comment): Person => {
    if (c.threadOwner === myId && me) return { userId: c.threadOwner, username: me.username, displayName: me.displayName, avatar: me.avatar }
    const friend = friends.find((f) => f.userId === c.threadOwner)
    if (friend) return friend
    if (c.threadOwner === c.userId) return c
    return { userId: c.threadOwner, username: c.ownerUsername ?? '', displayName: c.ownerDisplayName ?? null, avatar: null }
  }

  const closeThread = () => {
    const closed = thread
    setThread(null)
    if (!closed) return
    commentCounts([{ owner: closed.owner.userId, media: closed.media.id }])
      .then((found) => setCounts((c) => ({ ...c, ...found })))
      .catch(() => {})
  }

  if (!loaded) return <div className="skeleton-line" aria-label="Carregando" />

  if (friends.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-icon" aria-hidden>
          <Users />
        </p>
        <h2>Seu feed começa com amigos</h2>
        <p>Adicione amigos para ver o que eles estão assistindo, curtir e comentar as notas deles e trocar recomendações.</p>
        <button className="primary" onClick={onGoFriends}>
          Adicionar amigos
        </button>
      </div>
    )
  }

  const mediaRow = (m: Media) => {
    const mine = entries.get(m.id)
    return (
      <span className="media-row-body">
        <span className="media-row-title">{m.title}</span>
        <span className="media-row-meta">{metaLine(m, true)}</span>
        {mine && <span className="media-row-status">Você: {statusText(mine)}</span>}
      </span>
    )
  }

  const wantButton = (m: Media, theyWant: boolean) =>
    !entries.get(m.id) && (
      <button className="link-btn" onClick={() => classify(m, 'want', 'friend')}>
        <Bookmark size={15} /> {theyWant ? 'Eu também quero' : 'Quero ver'}
      </button>
    )

  return (
    <div className="feed">
      {notices.length > 0 && (
        <section className="likes-strip" aria-label="Curtidas e comentários para você">
          <h4 className="title-section">Para você</h4>
          <ul>
            {notices.map((n) => {
              const isFresh = n.at > activitySeenAt
              if (n.kind === 'like') {
                const l = n.like
                return (
                  <li key={`like:${l.userId}:${l.mediaId}`} className={isFresh ? 'fresh' : ''}>
                    <button className="likes-person" onClick={() => onOpenFriend(l)} aria-label={`Abrir perfil de ${shortName(l)}`}>
                      <Avatar person={l} size="sm" />
                    </button>
                    <span>
                      <strong>{shortName(l)}</strong> curtiu sua atividade em <em>{l.media?.title ?? 'um título'}</em>
                    </span>
                    <span className="feed-time">{timeAgo(l.createdAt)}</span>
                  </li>
                )
              }
              const c = n.comment
              const m = c.media
              const own = c.threadOwner === myId
              return (
                <li key={`comment:${c.id}`} className={`notice-comment${isFresh ? ' fresh' : ''}`}>
                  <button
                    className="notice-open"
                    disabled={!m}
                    onClick={() => m && setThread({ owner: ownerOf(c), media: m })}
                  >
                    <Avatar person={c} size="sm" />
                    <span className="notice-text">
                      <span>
                        <strong>{shortName(c)}</strong> {own ? 'comentou em' : 'também comentou em'} <em>{m?.title ?? 'um título'}</em>
                      </span>
                      <span className="notice-quote">{c.body}</span>
                    </span>
                    <span className="feed-time">{timeAgo(c.createdAt)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {items === null ? (
        <div className="skeleton-line" aria-label="Carregando" />
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>Nada novo por aqui. Quando seus amigos classificarem ou comentarem títulos, aparece tudo neste feed.</p>
        </div>
      ) : (
        <ul className="feed-list">
          {rows.map((row) => {
            if (row.kind === 'comment') {
              const c = row.comment
              const m = c.media ?? null
              const total = counts[threadKey(c.threadOwner, c.mediaId)] ?? (c.replies ?? 0) + 1
              const replies = Math.max(0, total - 1)
              return (
                <li key={`comment:${c.id}`} className="feed-item feed-comment">
                  <p className="feed-line">
                    <button className="feed-person" onClick={() => onOpenFriend(c)}>
                      <Avatar person={c} size="sm" />
                      <strong>{shortName(c)}</strong>
                    </button>
                    <span>comentou</span>
                    <span className="feed-time">{timeAgo(c.createdAt)}</span>
                  </p>
                  <p className="comment-bubble">{c.body}</p>
                  {m && (
                    <button className="feed-media" onClick={() => setOpen(m)}>
                      <Cover src={coverThumb(m)} lazy />
                      {mediaRow(m)}
                    </button>
                  )}
                  <div className="feed-actions">
                    {m && (
                      <button className="like-btn" onClick={() => setThread({ owner: ownerOf(c), media: m })}>
                        <MessageCircle /> Responder
                        {replies > 0 && <span>{replies}</span>}
                      </button>
                    )}
                    {m && wantButton(m, false)}
                  </div>
                </li>
              )
            }
            const item = row.item
            const m = item.media
            const total = counts[threadKey(item.userId, item.mediaId)] ?? 0
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
                    {mediaRow(m)}
                    {(item.status === 'seen' || item.favorite) && <TakeChip take={takeOf(item)} />}
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
                  {m && (
                    <button
                      className="like-btn"
                      aria-label={total ? `Comentários: ${total}` : 'Comentar'}
                      onClick={() => setThread({ owner: item, media: m, take: takeOf(item) })}
                    >
                      <MessageCircle />
                      {total > 0 ? <span>{total}</span> : <span>Comentar</span>}
                    </button>
                  )}
                  {m && wantButton(m, item.status === 'want')}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {(more.items || more.said) && items && (
        <div className="row center">
          <button
            disabled={loading}
            onClick={() =>
              void load({
                items: more.items ? items[items.length - 1]?.updatedAt : undefined,
                said: more.said && said.length ? timeOf(said[said.length - 1].createdAt) : undefined,
              })
            }
          >
            {loading ? 'Carregando…' : 'Ver mais'}
          </button>
        </div>
      )}
      {error && <p className="message center">{error}</p>}
      {open && <TitleSheet media={open} via="friend" onClose={() => setOpen(null)} />}
      {thread && <CommentThread owner={thread.owner} media={thread.media} take={thread.take} onClose={closeThread} />}
    </div>
  )
}
