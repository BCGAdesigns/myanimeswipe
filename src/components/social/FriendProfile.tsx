import { ArrowLeft, FlaskConical, Star, UserMinus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { removeFriend, type FriendProfile as Profile, type Person } from '../../friends/api'
import { compareLists, listStats, takeOf, type SharedEntry } from '../../friends/compare'
import { activityText, decimal, personName, shortName, timeAgo } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import { useStore } from '../../store'
import type { Media } from '../../types'
import { Cover, coverThumb, metaLine } from '../MediaCard'
import { statusText, TitleSheet } from '../TitleSheet'
import { CompareView } from './CompareView'
import { Avatar, CompatRing, errorText, TakeChip, Tabs } from './parts'

type View = 'common' | 'list' | 'activity'
type ListFilter = 'favorites' | 'rated' | 'want' | 'watching' | 'all'

const FILTERS: { id: ListFilter; label: string }[] = [
  { id: 'rated', label: 'Notas' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'want', label: 'Quero ver' },
  { id: 'watching', label: 'Assistindo' },
  { id: 'all', label: 'Tudo' },
]

interface Props {
  person: Person
  onBack: () => void
  onStartTest: (p: Person) => void
}

export function FriendProfile({ person, onBack, onStartTest }: Props) {
  const { entries, media } = useStore()
  const { friendList, rememberCompat, refresh } = useSocial()
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [view, setView] = useState<View>('common')
  const [open, setOpen] = useState<Media | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    friendList(person.userId)
      .then((p) => !cancelled && setProfile(p))
      .catch((e) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [person.userId, friendList])

  const comparison = useMemo(
    () => (profile ? compareLists(entries, media, { name: null, entries: profile.entries }) : null),
    [profile, entries, media],
  )
  useEffect(() => {
    if (comparison) rememberCompat(person.userId, comparison.compatibility)
  }, [comparison, person.userId, rememberCompat])
  const stats = useMemo(() => (profile ? listStats(profile.entries) : null), [profile])

  const card = profile ?? { ...person, bio: null }
  const name = shortName(card)

  const unfriend = async () => {
    if (!window.confirm(`Desfazer a amizade com ${personName(card)}? Vocês deixam de ver as listas e o feed um do outro.`)) return
    try {
      await removeFriend(person.userId)
      await refresh()
      onBack()
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <div className="friend-profile">
      <button className="link-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>

      <header className="profile-head">
        <Avatar person={card} size="lg" />
        <div className="profile-id">
          <h2>{personName(card)}</h2>
          <span>@{card.username}</span>
          {card.bio && <p>{card.bio}</p>}
        </div>
        {comparison && <CompatRing value={comparison.compatibility} size="sm" />}
      </header>

      {stats && (
        <div className="stats profile-stats">
          <div className="stat">
            <strong>{stats.seen}</strong>
            <span>vistos</span>
          </div>
          <div className="stat">
            <strong>{stats.average === null ? '–' : decimal(stats.average)}</strong>
            <span>nota média</span>
          </div>
          <div className="stat">
            <strong>{stats.favorites}</strong>
            <span>favoritos</span>
          </div>
          <div className="stat">
            <strong>{stats.want}</strong>
            <span>quer ver</span>
          </div>
        </div>
      )}

      <div className="row profile-actions">
        <button className="primary" onClick={() => onStartTest(person)}>
          <FlaskConical /> Teste de gosto com {name}
        </button>
      </div>

      {profile === undefined && !error && <div className="skeleton-line" aria-label="Carregando" />}
      {profile === null && <p className="message">Essa amizade não está mais ativa.</p>}

      {profile && comparison && (
        <>
          <Tabs
            label="Perfil do amigo"
            value={view}
            onChange={setView}
            items={[
              { id: 'common', label: 'Em comum' },
              { id: 'list', label: 'Lista' },
              { id: 'activity', label: 'Atividade' },
            ]}
          />
          {view === 'common' && <CompareView name={name} comparison={comparison} onOpen={setOpen} />}
          {view === 'list' && <TheirList entries={profile.entries} onOpen={setOpen} />}
          {view === 'activity' && <Activity entries={profile.entries} name={name} onOpen={setOpen} />}
        </>
      )}

      {error && <p className="message center">{error}</p>}
      <div className="row center">
        <button className="link-btn danger-link" onClick={() => void unfriend()}>
          <UserMinus size={15} /> Desfazer amizade
        </button>
      </div>
      {open && <TitleSheet media={open} via="friend" recommendTo={person.userId} onClose={() => setOpen(null)} />}
    </div>
  )
}

function rowMedia(e: SharedEntry, mine: Map<string, Media>) {
  return mine.get(e.mediaId) ?? e.media
}

function TheirList({ entries, onOpen }: { entries: SharedEntry[]; onOpen: (m: Media) => void }) {
  const { entries: myEntries, media } = useStore()
  const [filter, setFilter] = useState<ListFilter>('rated')
  const rows = useMemo(() => {
    const rating = (e: SharedEntry) => (e.status === 'seen' ? (e.rating ?? e.suggestedRating ?? -1) : -1)
    const list = entries.filter((e) => {
      switch (filter) {
        case 'favorites':
          return e.favorite
        case 'rated':
          return rating(e) >= 0
        case 'want':
          return e.status === 'want'
        case 'watching':
          return e.status === 'watching'
        case 'all':
          return e.status !== 'reject'
      }
    })
    return list.sort((a, b) => (filter === 'rated' ? rating(b) - rating(a) : 0) || b.updatedAt - a.updatedAt)
  }, [entries, filter])

  return (
    <div className="their-list">
      <div className="chips mini">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
            {f.id === 'favorites' && <Star size={13} fill={filter === f.id ? 'currentColor' : 'none'} />} {f.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="small muted center-text">Nada aqui.</p>
      ) : (
        <ul className="media-rows">
          {rows.slice(0, 200).map((e) => {
            const m = rowMedia(e, media)
            if (!m) return null
            const mine = myEntries.get(e.mediaId)
            return (
              <li key={e.mediaId}>
                <button className="media-row" onClick={() => onOpen(m)}>
                  <Cover src={coverThumb(m)} lazy />
                  <span className="media-row-body">
                    <span className="media-row-title">{m.title}</span>
                    <span className="media-row-meta">{metaLine(m, true)}</span>
                    {mine && <span className="media-row-status">Você: {statusText(mine)}</span>}
                  </span>
                  <TakeChip take={takeOf(e)} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Activity({ entries, name, onOpen }: { entries: SharedEntry[]; name: string; onOpen: (m: Media) => void }) {
  const { media } = useStore()
  const recent = useMemo(() => [...entries].filter((e) => e.updatedAt > 0 && e.status !== 'reject').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40), [entries])
  if (!recent.length) return <p className="small muted center-text">Sem atividade ainda.</p>
  return (
    <ul className="activity-list">
      {recent.map((e) => {
        const m = rowMedia(e, media)
        if (!m) return null
        return (
          <li key={e.mediaId}>
            <button className="media-row" onClick={() => onOpen(m)}>
              <Cover src={coverThumb(m)} lazy />
              <span className="media-row-body">
                <span className="media-row-meta">
                  {name} {activityText(e)} · {timeAgo(e.updatedAt)}
                </span>
                <span className="media-row-title">{m.title}</span>
              </span>
              {(e.status === 'seen' || e.favorite) && <TakeChip take={takeOf(e)} />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
