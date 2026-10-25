import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, type Preferences } from '../prefs'
import type { Entry, Media } from '../types'
import { catalogVariables } from './anilist'
import { buildMixedDeck, catalogFor, deckPhase, passesFilters, sourcesFor, type Catalogs } from './catalog'
import { anilistSites } from './providers'
import { discoverParams, kindOfTmdb, toMediaTmdb } from './tmdb'

const prefs = (p: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFS, ...p })
const TODAY = '2026-10-25'

describe('catalogVariables (AniList)', () => {
  it('maps sort, years, score and episodes to strict comparisons', () => {
    const v = catalogVariables(prefs({ sort: 'top', yearMin: 2000, yearMax: 2010, minScore: 75, maxEpisodes: 26 }), 3)
    expect(v).toMatchObject({ page: 3, sort: ['SCORE_DESC'], from: 20000000, to: 20110000, minScore: 74, maxEpisodes: 27 })
  })

  it('hides unreleased titles when sorting by release', () => {
    expect(catalogVariables(prefs({ sort: 'recent' }), 1).statusNot).toBe('NOT_YET_RELEASED')
    expect(catalogVariables(prefs(), 1).statusNot).toBeUndefined()
  })

  it('maps genres to avoid and streaming services to AniList names', () => {
    const v = catalogVariables(prefs({ avoidGenres: ['horror', 'reality'], providers: [8, 307] }), 1)
    expect(v.genresNot).toEqual(['Horror'])
    expect(v.licensedBy).toEqual(['Netflix'])
    expect(catalogVariables(prefs({ providers: [307] }), 1).licensedBy).toEqual([])
    expect(anilistSites([119])).toEqual(['Amazon Prime Video', 'Prime Video'])
  })
})

describe('discoverParams (TMDB)', () => {
  it('keeps animation out of movies and series, and talk shows and news out of series', () => {
    expect(discoverParams('movie', prefs(), 1, TODAY)).toMatchObject({
      path: '/discover/movie',
      params: { without_genres: '16', include_adult: 'false', sort_by: 'popularity.desc' },
    })
    expect(discoverParams('series', prefs(), 1, TODAY).params.without_genres).toBe('16,10767,10763')
  })

  it('builds cartoons from animation minus the anime keyword', () => {
    const { path, params } = discoverParams('cartoon-tv', prefs(), 2, TODAY)
    expect(path).toBe('/discover/tv')
    expect(params).toMatchObject({ page: 2, with_genres: 16, without_keywords: 210024, without_genres: '10767,10763' })
    expect(discoverParams('cartoon-movie', prefs(), 1, TODAY).params.without_genres).toBeUndefined()
  })

  it('applies filters with the right date field per type', () => {
    const p = prefs({ sort: 'top', yearMin: 1990, yearMax: 1999, minScore: 70, maxRuntime: 120, languages: ['en', 'pt'], avoidGenres: ['horror'] })
    const movie = discoverParams('movie', p, 1, TODAY).params
    expect(movie).toMatchObject({
      sort_by: 'vote_average.desc',
      'primary_release_date.gte': '1990-01-01',
      'primary_release_date.lte': '1999-12-31',
      'vote_average.gte': 7,
      'vote_count.gte': 500,
      'with_runtime.lte': 120,
      with_original_language: 'en|pt',
      without_genres: '27,16',
    })
    const tv = discoverParams('series', p, 1, TODAY).params
    expect(tv['first_air_date.gte']).toBe('1990-01-01')
    expect(tv['with_runtime.lte']).toBeUndefined()
    expect(tv['vote_count.gte']).toBe(200)
  })

  it('caps "recent" at today and asks for a few votes', () => {
    const params = discoverParams('movie', prefs({ sort: 'recent' }), 1, TODAY).params
    expect(params).toMatchObject({ sort_by: 'primary_release_date.desc', 'primary_release_date.lte': TODAY, 'vote_count.gte': 20 })
  })

  it('filters by streaming in Brazil', () => {
    expect(discoverParams('movie', prefs({ streamingOnly: true }), 1, TODAY).params).toMatchObject({
      watch_region: 'BR',
      with_watch_monetization_types: 'flatrate|free|ads',
    })
    expect(discoverParams('series', prefs({ providers: [8, 337] }), 1, TODAY).params.with_watch_providers).toBe('8|337')
  })
})

describe('toMediaTmdb', () => {
  const raw = {
    id: 550,
    title: 'Clube da Luta',
    original_title: 'Fight Club',
    poster_path: '/p.jpg',
    release_date: '1999-10-15',
    genre_ids: [18, 53],
    vote_average: 8.4,
    vote_count: 30000,
    overview: 'Um homem...',
    original_language: 'en',
  }

  it('maps a TMDB movie to the shared model', () => {
    expect(toMediaTmdb(raw, 'movie', 'movie')).toEqual({
      id: 'tmdb:movie:550',
      source: 'tmdb',
      sourceId: 550,
      tmdbType: 'movie',
      kind: 'movie',
      title: 'Clube da Luta',
      altTitle: 'Fight Club',
      cover: 'https://image.tmdb.org/t/p/w500/p.jpg',
      format: 'MOVIE',
      year: 1999,
      genres: ['drama', 'thriller'],
      tags: [],
      score: 84,
      synopsis: 'Um homem...',
      originalLanguage: 'en',
      links: { site: 'https://www.themoviedb.org/movie/550' },
    })
  })

  it('drops titles without a poster or marked adult, and hides scores with few votes', () => {
    expect(toMediaTmdb({ ...raw, poster_path: null }, 'movie', 'movie')).toBeNull()
    expect(toMediaTmdb({ ...raw, adult: true }, 'movie', 'movie')).toBeNull()
    expect(toMediaTmdb({ ...raw, vote_count: 3 }, 'movie', 'movie')?.score).toBeUndefined()
    expect(toMediaTmdb({ ...raw, release_date: '' }, 'movie', 'movie')?.year).toBeUndefined()
  })

  it('classifies recommendations by genre and language', () => {
    expect(kindOfTmdb({ ...raw, genre_ids: [16] }, 'movie')).toBe('cartoon')
    expect(kindOfTmdb({ ...raw, genre_ids: [16], original_language: 'ja' }, 'tv')).toBeNull()
    expect(kindOfTmdb({ ...raw, genre_ids: [10767] }, 'tv')).toBeNull()
    expect(kindOfTmdb(raw, 'tv')).toBe('series')
  })
})

const cat = (ids: string[], hash = 'h'): Catalogs[keyof Catalogs] => ({ ids, nextPage: 2, hasNextPage: true, hash, emptyPages: 0 })

describe('mixed deck', () => {
  const catalogs: Catalogs = {
    anime: cat(['a1', 'a2', 'a3']),
    movie: cat(['m1', 'm2']),
    series: cat(['s1']),
    'cartoon-tv': cat(['ct1', 'ct2']),
    'cartoon-movie': cat(['cm1']),
  }
  const all = DEFAULT_PREFS.kinds

  it('takes one card of each kind in turn, alternating cartoon series and movies', () => {
    expect(buildMixedDeck(all, catalogs, 'h', new Map())).toEqual(['a1', 'm1', 's1', 'ct1', 'a2', 'm2', 'cm1', 'a3', 'ct2'])
  })

  it('continues after the kind swiped last', () => {
    const deck = buildMixedDeck(all, catalogs, 'h', new Map(), { lastKind: 'anime', lastCartoon: 'cartoon-tv' })
    expect(deck.slice(0, 4)).toEqual(['m1', 's1', 'cm1', 'a1'])
  })

  it('reads the phase from the newest record', () => {
    const media = new Map<string, Media>([
      ['a1', { kind: 'anime' } as Media],
      ['ct1', { kind: 'cartoon', tmdbType: 'tv' } as Media],
    ])
    const entries = new Map<string, Entry>([
      ['ct1', { mediaId: 'ct1', status: 'seen', rating: null, suggestedRating: null, via: 'discover', updatedAt: 1, rev: 5 }],
      ['a1', { mediaId: 'a1', status: 'want', rating: null, suggestedRating: null, via: 'discover', updatedAt: 1, rev: 9 }],
    ])
    expect(deckPhase(entries, media)).toEqual({ lastKind: 'anime', lastCartoon: 'cartoon-tv' })
  })

  it('leaves out other kinds and stale catalogs, and puts skipped cards last', () => {
    const entries = new Map<string, Entry>([
      ['a1', { mediaId: 'a1', status: 'skip', skippedAt: 2, rating: null, suggestedRating: null, via: 'discover', updatedAt: 2 }],
      ['a2', { mediaId: 'a2', status: 'seen', rating: 7, suggestedRating: null, via: 'discover', updatedAt: 3 }],
    ])
    const stale: Catalogs = { ...catalogs, movie: cat(['m1'], 'old') }
    expect(buildMixedDeck(['anime', 'movie'], stale, 'h', entries)).toEqual(['a3', 'a1'])
    expect(catalogFor(stale, 'movie', 'h').ids).toEqual([])
    expect(sourcesFor(['cartoon', 'anime'])).toEqual(['anime', 'cartoon-tv', 'cartoon-movie'])
  })
})

describe('passesFilters', () => {
  const anime = { kind: 'anime', genres: ['action'], format: 'TV', episodes: 24, year: 2015, score: 80, streams: ['Crunchyroll'] } as Media
  const movie = { kind: 'movie', genres: ['drama'], year: 1999, score: 84, originalLanguage: 'en' } as Media

  it('checks what is known locally and lets unknown values pass', () => {
    expect(passesFilters(anime, prefs(), [])).toBe(true)
    expect(passesFilters(anime, prefs({ kinds: ['movie'] }), [])).toBe(false)
    expect(passesFilters(anime, prefs({ avoidGenres: ['action'] }), [])).toBe(false)
    expect(passesFilters(anime, prefs({ maxEpisodes: 12 }), [])).toBe(false)
    expect(passesFilters(anime, prefs({ animeFormats: ['MOVIE'] }), [])).toBe(false)
    expect(passesFilters(anime, prefs({ providers: [8] }), ['Netflix'])).toBe(false)
    expect(passesFilters(anime, prefs({ providers: [283] }), ['Crunchyroll'])).toBe(true)
    expect(passesFilters(movie, prefs({ languages: ['pt'] }), [])).toBe(false)
    expect(passesFilters(movie, prefs({ yearMin: 2000 }), [])).toBe(false)
    expect(passesFilters({ ...movie, score: undefined }, prefs({ minScore: 90 }), [])).toBe(true)
  })
})
