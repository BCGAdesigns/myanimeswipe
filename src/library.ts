// Sorting, filtering and searching the user's own records (Avaliar, Listas, search).
import type { Entry, Media, MediaKind } from './types'

export type LibrarySort = 'recent' | 'rating-desc' | 'rating-asc' | 'title' | 'year' | 'score'

export const SORT_LABELS: Record<LibrarySort, string> = {
  recent: 'Mais recentes',
  'rating-desc': 'Maior nota',
  'rating-asc': 'Menor nota',
  title: 'Título (A a Z)',
  year: 'Lançamento',
  score: 'Nota da comunidade',
}

export interface LibraryView {
  sort: LibrarySort
  kind: MediaKind | 'all'
  favoritesOnly: boolean
}

export const DEFAULT_VIEW: LibraryView = { sort: 'recent', kind: 'all', favoritesOnly: false }

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

/** Filters by kind and favorites, then sorts; titles break ties. Records without media are dropped. */
export function arrangeEntries(entries: Entry[], media: Map<string, Media>, view: LibraryView): Entry[] {
  const rows = entries.flatMap((e) => {
    const m = media.get(e.mediaId)
    if (!m) return []
    if (view.kind !== 'all' && m.kind !== view.kind) return []
    if (view.favoritesOnly && !e.favorite) return []
    return [{ e, m }]
  })
  const byTitle = (a: { m: Media }, b: { m: Media }) => collator.compare(a.m.title, b.m.title)
  const rating = (e: Entry) => e.rating ?? e.suggestedRating
  rows.sort((a, b) => {
    switch (view.sort) {
      case 'rating-desc':
        return (rating(b.e) ?? -1) - (rating(a.e) ?? -1) || b.e.updatedAt - a.e.updatedAt
      case 'rating-asc':
        return (rating(a.e) ?? 11) - (rating(b.e) ?? 11) || b.e.updatedAt - a.e.updatedAt
      case 'title':
        return byTitle(a, b)
      case 'year':
        return (b.m.year ?? 0) - (a.m.year ?? 0) || byTitle(a, b)
      case 'score':
        return (b.m.score ?? -1) - (a.m.score ?? -1) || byTitle(a, b)
      default:
        return b.e.updatedAt - a.e.updatedAt
    }
  })
  return rows.map((r) => r.e)
}

/** Lowercase without accents, so "pokemon" finds "Pokémon". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** Titles the user already classified whose name (or original name) contains the query. */
export function searchLibrary(query: string, entries: Map<string, Entry>, media: Map<string, Media>, limit = 20): Media[] {
  const q = normalizeText(query)
  if (q.length < 2) return []
  const found: Media[] = []
  for (const e of entries.values()) {
    const m = media.get(e.mediaId)
    if (!m || e.status === 'skip') continue
    if (normalizeText(m.title).includes(q) || (m.altTitle && normalizeText(m.altTitle).includes(q))) found.push(m)
    if (found.length >= limit) break
  }
  return found.sort((a, b) => collator.compare(a.title, b.title))
}
