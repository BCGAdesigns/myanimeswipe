import { ExternalLink, MessageCircle, Send, Star, Trash } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { COMMENT_MAX, friendsOnTitle, postComment, titleComments, type Comment, type FriendTake, type Person } from '../friends/api'
import { takeOf, type Take } from '../friends/compare'
import { shortName } from '../friends/feed'
import { useSocial } from '../friends/social'
import { genreLabel } from '../genres'
import { KIND_BADGES } from '../prefs'
import { fromStars, STARS, toStars } from '../rating'
import { useStore } from '../store'
import type { Entry, Media, SwipeAction } from '../types'
import { Cover, metaLine } from './MediaCard'
import { Sheet } from './Sheet'
import { CommentItem, CommentThread } from './social/CommentThread'
import { Avatar, errorText, TakeChip } from './social/parts'
import { RecommendSheet } from './social/RecommendSheet'
import { ACTION_ICONS, ACTION_LABEL, ACTION_STYLES } from './SwipeDeck'

/** Comments shown before "Ver todos". */
const FIRST_COMMENTS = 4

const SOURCE_NAME = { anilist: 'AniList', tmdb: 'TMDB' } as const

/** Where the title stands in the user's library, in one line. */
export function statusText(e: Entry): string {
  switch (e.status) {
    case 'seen': {
      if (e.rating !== null) return `Já vi · nota ${toStars(e.rating)}`
      return e.suggestedRating !== null ? `Já vi · falta confirmar a nota (${toStars(e.suggestedRating)})` : 'Já vi · sem nota'
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
  /** Friend ticked first when recommending (the sheet was opened from their profile). */
  recommendTo?: string
  onClose: () => void
}

/** Everything about one title, and every way to classify it, outside the swipe decks. */
export function TitleSheet({ media, via, recommendTo, onClose }: Props) {
  const { entries, classify, rate, removeEntry, toggleFavorite } = useStore()
  const { me, myId, friends } = useSocial()
  const entry = entries.get(media.id)
  const [more, setMore] = useState(false)
  const [takes, setTakes] = useState<FriendTake[] | null>(null)
  const [recommending, setRecommending] = useState(false)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [allComments, setAllComments] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [thread, setThread] = useState<{ owner: Person; take?: Take | null } | null>(null)
  const social = Boolean(me) && friends.length > 0

  useEffect(() => {
    if (!social) return
    let cancelled = false
    friendsOnTitle(media.id)
      .then((list) => !cancelled && setTakes(list))
      .catch(() => !cancelled && setTakes([]))
    return () => {
      cancelled = true
    }
  }, [social, media.id])

  const loadComments = useCallback(async () => {
    try {
      setComments(await titleComments(media.id))
    } catch {
      setComments((c) => c ?? [])
    }
  }, [media.id])

  useEffect(() => {
    if (social) void loadComments()
  }, [social, loadComments])

  const meAsPerson = (): Person | null =>
    myId && me ? { userId: myId, username: me.username, displayName: me.displayName, avatar: me.avatar } : null

  /** The person whose conversation a comment is in. */
  const ownerOf = (c: Comment): Person => {
    if (c.threadOwner === myId) return meAsPerson() ?? c
    const friend = friends.find((f) => f.userId === c.threadOwner)
    if (friend) return friend
    return { userId: c.threadOwner, username: c.ownerUsername ?? '', displayName: c.ownerDisplayName ?? null, avatar: null }
  }

  /** Where a comment was made, when it is not the author talking about the title. */
  const contextOf = (c: Comment): string | undefined => {
    if (c.threadOwner === c.userId) return undefined
    if (c.threadOwner === myId) return 'na sua conversa'
    return `na conversa de ${shortName({ displayName: c.ownerDisplayName ?? null, username: c.ownerUsername ?? '' })}`
  }

  const commentsIn = (owner: string) => (comments ?? []).filter((c) => c.threadOwner === owner).length

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || !myId) return
    setSending(true)
    setCommentError(null)
    try {
      await postComment(myId, media, body)
      setText('')
      setAllComments(false)
      await loadComments()
    } catch (err) {
      setCommentError(errorText(err))
    } finally {
      setSending(false)
    }
  }

  const closeThread = () => {
    setThread(null)
    void loadComments()
  }
  const seen = entry?.status === 'seen'
  const actions = seen ? SEEN_ACTIONS : UNSEEN_ACTIONS
  const stored = entry ? (entry.rating ?? entry.suggestedRating) : null
  const current = stored === null ? null : toStars(stored)

  const act = (action: SwipeAction) => {
    navigator.vibrate?.(8)
    classify(media, action, entry?.via ?? via)
  }

  return (
    <>
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
            {STARS.map((s) => (
              <button
                key={s}
                className={s === current ? 'score active' : 'score'}
                style={{ ['--s' as string]: s }}
                aria-label={`Nota ${s}`}
                onClick={() => rate(media.id, fromStars(s))}
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

      {social && (
        <>
          <h4 className="title-section">Seus amigos</h4>
          {takes === null ? (
            <div className="skeleton-line short" aria-label="Carregando" />
          ) : takes.length > 0 ? (
            <ul className="friend-takes">
              {takes.map((t) => {
                const n = commentsIn(t.userId)
                return (
                  <li key={t.userId}>
                    <button
                      className="friend-take"
                      aria-label={`Comentar a nota de ${shortName(t)}`}
                      onClick={() => setThread({ owner: t, take: takeOf(t) })}
                    >
                      <Avatar person={t} size="sm" />
                      <span>{shortName(t)}</span>
                      <TakeChip take={takeOf(t)} />
                      {n > 0 && (
                        <span className="take-comments">
                          <MessageCircle size={13} /> {n}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="small muted">Nenhum amigo classificou este título ainda.</p>
          )}
          <div className="row">
            <button onClick={() => setRecommending(true)}>
              <Send /> Recomendar para amigos
            </button>
          </div>

          <h4 className="title-section">Comentários</h4>
          {comments === null ? (
            <div className="skeleton-line short" aria-label="Carregando" />
          ) : comments.length === 0 ? (
            <p className="small muted">Ninguém comentou ainda. O que você escrever aqui aparece para os seus amigos.</p>
          ) : (
            <ul className="comment-list">
              {(allComments ? comments : comments.slice(0, FIRST_COMMENTS)).map((c) => (
                <CommentItem key={c.id} comment={c} context={contextOf(c)} onOpen={() => setThread({ owner: ownerOf(c) })} />
              ))}
            </ul>
          )}
          {comments && comments.length > FIRST_COMMENTS && !allComments && (
            <div className="row center">
              <button className="link-btn" onClick={() => setAllComments(true)}>
                Ver todos os {comments.length} comentários
              </button>
            </div>
          )}
          <form className="comment-form" onSubmit={send}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Comente sobre este título…"
              maxLength={COMMENT_MAX}
              rows={1}
              aria-label="Seu comentário sobre o título"
            />
            <button type="submit" className="primary" disabled={sending || !text.trim()} aria-label="Enviar comentário">
              <Send size={18} />
            </button>
          </form>
          {commentError && <p className="message">{commentError}</p>}
        </>
      )}

      {entry && (
        <div className="row center">
          <button className="link-btn danger-link" onClick={() => removeEntry(media.id)}>
            <Trash size={15} /> Tirar da minha biblioteca
          </button>
        </div>
      )}
    </Sheet>
    {recommending && <RecommendSheet media={media} takes={takes ?? []} preselect={recommendTo} onClose={() => setRecommending(false)} />}
    {thread && <CommentThread owner={thread.owner} media={media} take={thread.take} onClose={closeThread} />}
    </>
  )
}
