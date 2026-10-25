import { Bookmark, Heart, Send, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { unsendRecommendation, updateRecommendation, type Person, type ReceivedRec, type SentRec } from '../../friends/api'
import { sentStatus, shortName, timeAgo } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import { useStore } from '../../store'
import type { Media } from '../../types'
import { Cover, coverThumb, metaLine } from '../MediaCard'
import { statusText, TitleSheet } from '../TitleSheet'
import { Avatar, errorText, Tabs } from './parts'

/** Unseen recommendations count as seen after this long on screen. */
const SEEN_AFTER_MS = 1500

export function RecsView({ onOpenFriend }: { onOpenFriend: (p: Person) => void }) {
  const { received, sent, refresh } = useSocial()
  const [tab, setTab] = useState<'received' | 'sent'>('received')
  const [open, setOpen] = useState<Media | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unseen = received.filter((r) => !r.seenAt)
    if (!unseen.length || tab !== 'received') return
    const timer = window.setTimeout(() => {
      Promise.all(unseen.map((r) => updateRecommendation(r.id, { seen: true })))
        .then(() => refresh())
        .catch((e) => setError(errorText(e)))
    }, SEEN_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [received, tab, refresh])

  const act = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      await refresh()
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <div className="recs-view">
      <Tabs
        label="Recomendações"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'received', label: 'Recebidas', badge: received.filter((r) => !r.seenAt).length },
          { id: 'sent', label: 'Enviadas' },
        ]}
      />
      {tab === 'received' ? (
        received.length === 0 ? (
          <Empty text="Quando um amigo te recomendar algo, aparece aqui." />
        ) : (
          <ul className="rec-list">
            {received.map((r) => (
              <Received key={r.id} rec={r} onOpen={setOpen} onOpenFriend={onOpenFriend} onAct={act} />
            ))}
          </ul>
        )
      ) : sent.length === 0 ? (
        <Empty text="Você ainda não recomendou nada." />
      ) : (
        <ul className="rec-list">
          {sent.map((r) => (
            <Sent key={r.id} rec={r} onOpen={setOpen} onOpenFriend={onOpenFriend} onAct={act} />
          ))}
        </ul>
      )}
      {error && <p className="message center">{error}</p>}
      {open && <TitleSheet media={open} via="friend" onClose={() => setOpen(null)} />}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <p className="empty-icon" aria-hidden>
        <Send />
      </p>
      <p>{text}</p>
      <p className="small">Para recomendar, abra qualquer título e toque em Recomendar para amigos.</p>
    </div>
  )
}

interface RowProps<T> {
  rec: T
  onOpen: (m: Media) => void
  onOpenFriend: (p: Person) => void
  onAct: (action: () => Promise<unknown>) => Promise<void>
}

function MediaLine({ media, onOpen }: { media: Media; onOpen: (m: Media) => void }) {
  const { entries } = useStore()
  const mine = entries.get(media.id)
  return (
    <button className="feed-media" onClick={() => onOpen(media)}>
      <Cover src={coverThumb(media)} lazy />
      <span className="media-row-body">
        <span className="media-row-title">{media.title}</span>
        <span className="media-row-meta">{metaLine(media, true)}</span>
        {mine && <span className="media-row-status">Você: {statusText(mine)}</span>}
      </span>
    </button>
  )
}

function Received({ rec, onOpen, onOpenFriend, onAct }: RowProps<ReceivedRec>) {
  const { entries, classify } = useStore()
  const mine = entries.get(rec.mediaId)
  const liked = Boolean(rec.likedAt)
  return (
    <li className="rec-card">
      <p className="feed-line">
        <button className="feed-person" onClick={() => onOpenFriend(rec)}>
          <Avatar person={rec} size="sm" />
          <strong>{shortName(rec)}</strong>
        </button>
        <span>recomendou</span>
        <span className="feed-time">{timeAgo(rec.createdAt)}</span>
        {!rec.seenAt && <span className="new-tag">Nova</span>}
      </p>
      <MediaLine media={rec.media} onOpen={onOpen} />
      {rec.note && <p className="rec-note">{rec.note}</p>}
      <div className="feed-actions">
        <button
          className={`like-btn${liked ? ' on' : ''}`}
          aria-pressed={liked}
          onClick={() => void onAct(() => updateRecommendation(rec.id, { liked: !liked }))}
        >
          <Heart fill={liked ? 'currentColor' : 'none'} /> {liked ? 'Curtiu' : 'Curtir'}
        </button>
        {!mine && (
          <button className="link-btn" onClick={() => classify(rec.media, 'want', 'friend')}>
            <Bookmark size={15} /> Quero ver
          </button>
        )}
        <button
          className="icon-btn dismiss"
          aria-label="Dispensar recomendação"
          title="Dispensar"
          onClick={() => void onAct(() => updateRecommendation(rec.id, { dismiss: true }))}
        >
          <X />
        </button>
      </div>
    </li>
  )
}

function Sent({ rec, onOpen, onOpenFriend, onAct }: RowProps<SentRec>) {
  const status = sentStatus(rec)
  return (
    <li className="rec-card">
      <p className="feed-line">
        <span>Para</span>
        <button className="feed-person" onClick={() => onOpenFriend(rec)}>
          <Avatar person={rec} size="sm" />
          <strong>{shortName(rec)}</strong>
        </button>
        <span className="feed-time">{timeAgo(rec.createdAt)}</span>
      </p>
      <MediaLine media={rec.media} onOpen={onOpen} />
      {rec.note && <p className="rec-note mine">{rec.note}</p>}
      <div className="feed-actions">
        <span className={`rec-status ${status.tone}`}>{status.text}</span>
        {rec.likedAt && status.text !== 'Curtiu a indicação' && (
          <span className="rec-status good">
            <Heart size={13} fill="currentColor" /> Curtiu
          </span>
        )}
        <button
          className="icon-btn dismiss"
          aria-label="Desfazer recomendação"
          title="Desfazer"
          onClick={() => {
            if (window.confirm('Desfazer esta recomendação?')) void onAct(() => unsendRecommendation(rec.id))
          }}
        >
          <Trash2 />
        </button>
      </div>
    </li>
  )
}
