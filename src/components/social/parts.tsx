// Small pieces shared by the social screens: avatar, a person's take on a title, the
// compatibility ring and the section tabs.
import { Star } from 'lucide-react'
import type { Take } from '../../friends/compare'
import { personName, takeLabel } from '../../friends/feed'

/** Profile pictures to pick from; without one the first letter of the name shows. */
export const AVATARS = ['🦊', '🐱', '🐼', '🐸', '🐙', '🦄', '🐲', '👾', '🤖', '👻', '🎬', '🍿', '🎮', '🌸', '⚡', '🌙', '🔥', '🍜']

interface AvatarPerson {
  avatar: string | null
  displayName: string | null
  username: string
}

export function Avatar({ person, size = 'md' }: { person: AvatarPerson; size?: 'sm' | 'md' | 'lg' }) {
  const letter = Array.from((person.displayName ?? person.username).trim())[0]?.toUpperCase() ?? '?'
  return (
    <span className={`avatar ${size}${person.avatar ? ' emoji' : ''}`} aria-hidden>
      {person.avatar ?? letter}
    </span>
  )
}

/** Name with the @username under it; just the @username when there is no name. */
export function PersonName({ person, sub }: { person: AvatarPerson; sub?: string }) {
  const second = sub ?? (person.displayName ? `@${person.username}` : '')
  return (
    <span className="friend-name">
      {personName(person)}
      {second && <small>{second}</small>}
    </span>
  )
}

/** A rating colored from red (0) to green (10), or a short status. */
export function TakeChip({ take, label }: { take: Take; label?: string }) {
  const rated = take.rating !== null
  return (
    <span
      className={`take-chip${rated ? ' rated' : ''}`}
      style={rated ? { ['--s' as string]: take.rating } : undefined}
      aria-label={label ? `${label}: ${takeLabel(take)}` : undefined}
    >
      {take.favorite && <Star size={11} fill="currentColor" />}
      {takeLabel(take)}
    </span>
  )
}

export function CompatRing({ value, size = 'md' }: { value: number | null; size?: 'sm' | 'md' }) {
  return (
    <div className={`compat ${size}`} style={{ ['--p' as string]: value ?? 0 }} aria-label={value === null ? 'Compatibilidade desconhecida' : `Compatibilidade ${value}%`}>
      <strong>{value === null ? '?' : `${value}%`}</strong>
    </div>
  )
}

export interface TabItem<T extends string> {
  id: T
  label: string
  badge?: number
}

/** Tabs in a pill track, with a count badge for things waiting for the user. */
export function Tabs<T extends string>({ items, value, onChange, label }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {!!t.badge && <span className="tab-count">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
