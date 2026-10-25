import { describe, expect, it } from 'vitest'
import { anilistGenreNames, genreKey, genreLabel, genresFromTmdb, tmdbGenreIds } from './genres'
import { activeFilterCount, ALL_ANIME_FORMATS, ALL_KINDS, DEFAULT_PREFS, filterHash, normalizePrefs } from './prefs'

describe('normalizePrefs', () => {
  it('returns the defaults for missing or malformed input', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(normalizePrefs('nonsense')).toEqual(DEFAULT_PREFS)
  })

  it('keeps valid values and drops invalid ones', () => {
    const p = normalizePrefs({
      kinds: ['movie', 'podcast', 'anime'],
      sort: 'top',
      yearMin: 1990,
      yearMax: 'soon',
      minScore: 70,
      avoidGenres: ['horror', 3],
      animeFormats: ['TV', 'BLURAY'],
      providers: [8, '119'],
      streamingOnly: 'yes',
      updatedAt: 123,
    })
    expect(p.kinds).toEqual(['movie', 'anime'])
    expect(p.sort).toBe('top')
    expect(p.yearMin).toBe(1990)
    expect(p.yearMax).toBeNull()
    expect(p.avoidGenres).toEqual(['horror'])
    expect(p.animeFormats).toEqual(['TV'])
    expect(p.providers).toEqual([8])
    expect(p.streamingOnly).toBe(false)
    expect(p.updatedAt).toBe(123)
  })

  it('never ends up with nothing to classify', () => {
    expect(normalizePrefs({ kinds: [] }).kinds).toEqual(ALL_KINDS)
  })

  it('deals Descobrir by taste unless a shuffle was chosen', () => {
    expect(normalizePrefs({}).discoverOrder).toBe('taste')
    expect(normalizePrefs({ discoverOrder: 'random' }).discoverOrder).toBe('random')
    expect(normalizePrefs({ discoverOrder: 'chaos' }).discoverOrder).toBe('taste')
  })
})

describe('filterHash', () => {
  it('ignores kinds, timestamps, list order and how Descobrir deals the titles', () => {
    const a = { ...DEFAULT_PREFS, kinds: ['anime' as const], avoidGenres: ['horror', 'drama'], updatedAt: 1 }
    const b = { ...DEFAULT_PREFS, kinds: ALL_KINDS, avoidGenres: ['drama', 'horror'], updatedAt: 2, discoverOrder: 'random' as const }
    expect(filterHash(a)).toBe(filterHash(b))
  })

  it('changes with any filter', () => {
    expect(filterHash({ ...DEFAULT_PREFS, sort: 'recent' })).not.toBe(filterHash(DEFAULT_PREFS))
    expect(filterHash({ ...DEFAULT_PREFS, providers: [8] })).not.toBe(filterHash(DEFAULT_PREFS))
  })
})

describe('activeFilterCount', () => {
  it('counts filters that differ from the defaults', () => {
    expect(activeFilterCount(DEFAULT_PREFS)).toBe(0)
    expect(
      activeFilterCount({ ...DEFAULT_PREFS, sort: 'top', avoidGenres: ['horror'], streamingOnly: true, providers: [8] }),
    ).toBe(3)
    expect(activeFilterCount({ ...DEFAULT_PREFS, animeFormats: ALL_ANIME_FORMATS })).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_PREFS, animeFormats: ['TV'] })).toBe(1)
  })
})

describe('genres', () => {
  it('maps AniList names and stored keys to one vocabulary', () => {
    expect(genreKey('Sci-Fi')).toBe('scifi')
    expect(genreKey('Slice of Life')).toBe('slice-of-life')
    expect(genreKey('scifi')).toBe('scifi')
    expect(genreKey('Some New Genre')).toBe('some-new-genre')
    expect(genreLabel('Comedy')).toBe('Comédia')
  })

  it('maps TMDB ids per type', () => {
    expect(genresFromTmdb([28, 12, 16], 'movie')).toEqual(['action', 'adventure'])
    // TV has one "Action & Adventure" id.
    expect(genresFromTmdb([10759], 'tv')).toEqual(['action', 'adventure'])
    expect(tmdbGenreIds(['action', 'adventure'], 'tv')).toEqual([10759])
    expect(tmdbGenreIds(['horror', 'mecha'], 'movie')).toEqual([27])
    expect(anilistGenreNames(['horror', 'documentary'])).toEqual(['Horror'])
  })
})
