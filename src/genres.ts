// One genre vocabulary for every source: AniList names and TMDB ids map to these keys,
// so filters and taste profiles work across anime, movies, series and cartoons.

interface GenreDef {
  key: string
  label: string
  anilist?: string
  tmdbMovie?: number[]
  tmdbTv?: number[]
}

export const GENRES: GenreDef[] = [
  { key: 'action', label: 'Ação', anilist: 'Action', tmdbMovie: [28], tmdbTv: [10759] },
  { key: 'adventure', label: 'Aventura', anilist: 'Adventure', tmdbMovie: [12], tmdbTv: [10759] },
  { key: 'comedy', label: 'Comédia', anilist: 'Comedy', tmdbMovie: [35], tmdbTv: [35] },
  { key: 'drama', label: 'Drama', anilist: 'Drama', tmdbMovie: [18], tmdbTv: [18] },
  { key: 'fantasy', label: 'Fantasia', anilist: 'Fantasy', tmdbMovie: [14], tmdbTv: [10765] },
  { key: 'scifi', label: 'Ficção científica', anilist: 'Sci-Fi', tmdbMovie: [878], tmdbTv: [10765] },
  { key: 'horror', label: 'Terror', anilist: 'Horror', tmdbMovie: [27] },
  { key: 'mystery', label: 'Mistério', anilist: 'Mystery', tmdbMovie: [9648], tmdbTv: [9648] },
  { key: 'romance', label: 'Romance', anilist: 'Romance', tmdbMovie: [10749] },
  { key: 'thriller', label: 'Suspense', anilist: 'Thriller', tmdbMovie: [53] },
  { key: 'crime', label: 'Crime', tmdbMovie: [80], tmdbTv: [80] },
  { key: 'documentary', label: 'Documentário', tmdbMovie: [99], tmdbTv: [99] },
  { key: 'family', label: 'Família', tmdbMovie: [10751], tmdbTv: [10751] },
  { key: 'kids', label: 'Infantil', tmdbTv: [10762] },
  { key: 'history', label: 'História', tmdbMovie: [36] },
  { key: 'war', label: 'Guerra', tmdbMovie: [10752], tmdbTv: [10768] },
  { key: 'western', label: 'Faroeste', tmdbMovie: [37], tmdbTv: [37] },
  { key: 'music', label: 'Música', anilist: 'Music', tmdbMovie: [10402] },
  { key: 'reality', label: 'Reality show', tmdbTv: [10764] },
  { key: 'soap', label: 'Novela', tmdbTv: [10766] },
  { key: 'sports', label: 'Esportes', anilist: 'Sports' },
  { key: 'slice-of-life', label: 'Slice of life', anilist: 'Slice of Life' },
  { key: 'supernatural', label: 'Sobrenatural', anilist: 'Supernatural' },
  { key: 'psychological', label: 'Psicológico', anilist: 'Psychological' },
  { key: 'mecha', label: 'Mecha', anilist: 'Mecha' },
  { key: 'ecchi', label: 'Ecchi', anilist: 'Ecchi' },
  { key: 'mahou-shoujo', label: 'Mahou shoujo', anilist: 'Mahou Shoujo' },
]

const BY_KEY = new Map(GENRES.map((g) => [g.key, g]))
const BY_ANILIST = new Map(GENRES.filter((g) => g.anilist).map((g) => [g.anilist!.toLowerCase(), g.key]))

/** TMDB genres that are not tastes: animation is a content kind here, talk and news are excluded. */
export const TMDB_ANIMATION = 16
export const TMDB_TV_EXCLUDED = [10767, 10763]

/** Canonical key for a stored genre: already a key, an AniList name (older records), or a slug. */
export function genreKey(raw: string): string {
  if (BY_KEY.has(raw)) return raw
  return BY_ANILIST.get(raw.toLowerCase()) ?? raw.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function genreLabel(raw: string): string {
  return BY_KEY.get(genreKey(raw))?.label ?? raw
}

export function genresFromTmdb(ids: number[], type: 'movie' | 'tv'): string[] {
  const keys = new Set<string>()
  for (const g of GENRES) {
    const ownIds = type === 'movie' ? g.tmdbMovie : g.tmdbTv
    if (ownIds?.some((id) => ids.includes(id))) keys.add(g.key)
  }
  return [...keys]
}

export function anilistGenreNames(keys: string[]): string[] {
  return keys.flatMap((k) => BY_KEY.get(k)?.anilist ?? [])
}

export function tmdbGenreIds(keys: string[], type: 'movie' | 'tv'): number[] {
  return [...new Set(keys.flatMap((k) => (type === 'movie' ? BY_KEY.get(k)?.tmdbMovie : BY_KEY.get(k)?.tmdbTv) ?? []))]
}
