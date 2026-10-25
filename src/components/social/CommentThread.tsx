import { Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { COMMENT_MAX, deleteComment, postComment, threadComments, type Comment, type Person } from '../../friends/api'
import type { Take } from '../../friends/compare'
import { personName, shortName, timeAgo } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import type { Media } from '../../types'
import { Cover, coverThumb, metaLine } from '../MediaCard'
import { Sheet } from '../Sheet'
import { Avatar, errorText, TakeChip } from './parts'

interface Props {
  /** Whose conversation: the friend whose rating it is about, or the user for their own. */
  owner: Person
  media: Media
  /** The owner's take on the title, shown at the top. */
  take?: Take | null
  onClose: () => void
}

/** One person's conversation about one title: their friends comment, they answer. */
export function CommentThread({ owner, media, take, onClose }: Props) {
  const { myId, me, refresh } = useSocial()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listEnd = useRef<HTMLDivElement>(null)
  const ownThread = owner.userId === myId
  const name = ownThread ? 'Você' : shortName(owner)

  const load = useCallback(async () => {
    try {
      const list = await threadComments(owner.userId, media.id)
      if (list === null) setError('Essa conversa não está mais aberta para você.')
      setComments(list ?? [])
    } catch (e) {
      setError(errorText(e))
      setComments([])
    }
  }, [owner.userId, media.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' })
  }, [comments])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setSending(true)
    setError(null)
    try {
      await postComment(owner.userId, media, body)
      setText('')
      await load()
      void refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSending(false)
    }
  }

  const remove = async (c: Comment) => {
    if (!window.confirm('Apagar este comentário?')) return
    try {
      await deleteComment(c.id)
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <Sheet
      title="Comentários"
      onClose={onClose}
      className="tall"
      footer={
        me ? (
          <form className="comment-form" onSubmit={send}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={ownThread ? 'Escreva o que achou…' : `Comente com ${shortName(owner)}…`}
              maxLength={COMMENT_MAX}
              rows={1}
              aria-label="Seu comentário"
            />
            <button type="submit" className="primary" disabled={sending || !text.trim()} aria-label="Enviar comentário">
              <Send size={18} />
            </button>
          </form>
        ) : undefined
      }
    >
      <div className="thread-head">
        <Cover src={coverThumb(media)} />
        <div>
          <p className="thread-who">
            <Avatar person={owner} size="sm" />
            <strong>{ownThread ? 'Sua conversa' : personName(owner)}</strong>
            {take && (take.rating !== null || take.favorite) && <TakeChip take={take} />}
          </p>
          <h3>{media.title}</h3>
          <p className="meta">{metaLine(media, true)}</p>
        </div>
      </div>

      {comments === null ? (
        <div className="skeleton-line" aria-label="Carregando" />
      ) : comments.length === 0 ? (
        <p className="small muted center-text">
          {ownThread
            ? 'Conte para seus amigos o que achou.'
            : `Ninguém comentou ainda. Seu comentário aparece para ${name} e para os amigos de ${name}.`}
        </p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} canDelete={c.mine || ownThread} onDelete={() => void remove(c)} />
          ))}
        </ul>
      )}
      <div ref={listEnd} />
      {error && <p className="message">{error}</p>}
    </Sheet>
  )
}

export function CommentItem({
  comment,
  canDelete,
  onDelete,
  context,
  onOpen,
}: {
  comment: Comment
  canDelete?: boolean
  onDelete?: () => void
  /** A line above the text, such as whose rating it is about. */
  context?: string
  onOpen?: () => void
}) {
  const body = (
    <>
      <Avatar person={comment} size="sm" />
      <div className="comment-body">
        <p className="comment-meta">
          <strong>{comment.mine ? 'Você' : shortName(comment)}</strong>
          {context && <span>{context}</span>}
          <span className="feed-time">{timeAgo(comment.createdAt)}</span>
        </p>
        <p className="comment-text">{comment.body}</p>
      </div>
    </>
  )
  return (
    <li className={`comment${comment.mine ? ' mine' : ''}`}>
      {onOpen ? (
        <button className="comment-open" onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className="comment-open">{body}</div>
      )}
      {canDelete && onDelete && (
        <button className="icon-btn comment-delete" aria-label="Apagar comentário" onClick={onDelete}>
          <Trash2 />
        </button>
      )}
    </li>
  )
}
