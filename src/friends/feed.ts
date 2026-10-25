// Wording for friends' activity, sent recommendations and how long ago things happened.
import { shownRating } from '../rating'
import type { EntryStatus } from '../types'
import type { SentRec } from './api'
import type { Take } from './compare'

/** "@ana" or the name they chose. */
export const personName = (p: { displayName: string | null; username: string }) => p.displayName ?? `@${p.username}`

/** First name for short sentences ("Ana recomenda"). */
export const shortName = (p: { displayName: string | null; username: string }) =>
  p.displayName?.trim().split(/\s+/)[0] || `@${p.username}`

/** What someone did with a title, shown above its card: "Ana deu nota 9". */
export function activityText(e: { status: EntryStatus; rating: number | null; suggestedRating: number | null; favorite: boolean }): string {
  if (e.favorite) return 'favoritou'
  switch (e.status) {
    case 'seen': {
      const r = shownRating(e.rating ?? e.suggestedRating)
      return r === null ? 'já viu' : `deu nota ${r}`
    }
    case 'want':
      return 'quer ver'
    case 'watching':
      return 'está assistindo'
    case 'paused':
      return 'pausou'
    case 'dropped':
      return 'largou'
    case 'reject':
      return 'não quer ver'
    case 'skip':
      return 'pulou'
  }
}

/** A short label for one person's take, for chips next to a title. */
export function takeLabel(t: Take): string {
  if (t.rating !== null) return String(t.rating)
  switch (t.status) {
    case 'seen':
      return 'Viu'
    case 'want':
      return 'Quer ver'
    case 'watching':
      return 'Vendo'
    case 'paused':
      return 'Pausa'
    case 'dropped':
      return 'Largou'
    case 'reject':
      return 'Não quer'
    case 'skip':
      return 'Pulou'
  }
}

export type Tone = 'good' | 'bad' | 'neutral'

/** What the friend did with a title the user recommended. */
export function sentStatus(s: Pick<SentRec, 'theirStatus' | 'theirRating' | 'theirFavorite' | 'dismissed' | 'likedAt' | 'seenAt'>): {
  text: string
  tone: Tone
} {
  if (s.theirFavorite) return { text: 'Viu e favoritou', tone: 'good' }
  switch (s.theirStatus) {
    case 'seen': {
      const r = shownRating(s.theirRating)
      if (r === null) return { text: 'Já viu', tone: 'neutral' }
      return { text: `Viu e deu nota ${r}`, tone: r >= 6 ? 'good' : r <= 3 ? 'bad' : 'neutral' }
    }
    case 'watching':
      return { text: 'Está assistindo', tone: 'good' }
    case 'want':
      return { text: 'Colocou na lista Quero ver', tone: 'good' }
    case 'paused':
      return { text: 'Pausou', tone: 'neutral' }
    case 'dropped':
      return { text: 'Largou', tone: 'bad' }
    case 'reject':
      return { text: 'Não quis ver', tone: 'bad' }
  }
  if (s.dismissed) return { text: 'Dispensou', tone: 'bad' }
  if (s.likedAt) return { text: 'Curtiu a indicação', tone: 'good' }
  if (s.seenAt) return { text: 'Viu a indicação', tone: 'neutral' }
  return { text: 'Ainda não viu', tone: 'neutral' }
}

/** Label for a compatibility percentage. */
export function compatLabel(value: number): string {
  if (value >= 85) return 'Gosto quase idêntico'
  if (value >= 70) return 'Combinam bastante'
  if (value >= 55) return 'Combinam em parte'
  if (value >= 40) return 'Gostos diferentes'
  return 'Gostos opostos'
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })

/** "agora", "5 min", "3 h", "ontem", "4 dias", then the date. */
export function timeAgo(at: number | string, now = Date.now()): string {
  const ms = typeof at === 'string' ? Date.parse(at) : at
  if (!Number.isFinite(ms)) return ''
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return 'agora'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h`
  if (diff < 2 * DAY) return 'ontem'
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} dias`
  return dateFormat.format(ms)
}

/** "1,4" with the Brazilian decimal comma. */
export const decimal = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
