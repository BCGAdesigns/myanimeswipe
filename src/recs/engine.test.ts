import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, type Preferences } from '../prefs'
import type { Recommendation } from '../sources/anilist'
import type { Entry, Media } from '../types'
import { buildRecs, contentScore, isStale, pickSeeds, signalWeight, tasteProfile, type RecsFetchers } from './engine'

const media = (id: string, over: Partial<Media> = {}): Media => ({
  id,
  source: id.startsWith('tmdb') ? 'tmdb' : 'anilist',
  sourceId: Number(id.replace(/\D/g, '')),
  tmdbType: id.startsWith('tmdb:movie') ? 'movie' : id.startsWith('tmdb:tv') ? 'tv' : undefined,
  kind: id.startsWith('tmdb:movie') ? 'movie' : id.startsWith('tmdb:tv') ? 'series' : 'anime',
  title: id,
  cover: '',
  genres: [],
  tags: [],
  links: {},
  ...over,
})

const entry = (mediaId: string, over: Partial<Entry> = {}): Entry => ({
  mediaId,
  status: 'seen',
  rating: null,
  suggestedRating: null,
  via: 'discover',
  updatedAt: 1,
  ...over,
})

const prefs = (p: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFS, ...p })

describe('signalWeight', () => {
  it('ranks favorite over ratings over statuses', () => {
    expect(signalWeight(entry('a', { favorite: true, rating: 2 }))).toBe(3)
    expect(signalWeight(entry('a', { rating: 10 }))).toBe(2.25)
    expect(signalWeight(entry('a', { suggestedRating: 8 }))).toBe(1.25)
    expect(signalWeight(entry('a', { rating: 7 }))).toBe(0.75)
    expect(signalWeight(entry('a', { suggestedRating: 3 }))).toBe(-1.25)
    expect(signalWeight(entry('a'))).toBe(0.3)
    expect(signalWeight(entry('a', { status: 'watching' }))).toBe(1)
    expect(signalWeight(entry('a', { status: 'dropped' }))).toBe(-1)
    expect(signalWeight(entry('a', { status: 'skip' }))).toBe(0)
  })
})

describe('pickSeeds', () => {
  it('keeps strong positive signals of the chosen kinds, strongest first', () => {
    const m = new Map([
      ['anilist:1', media('anilist:1')],
      ['anilist:2', media('anilist:2')],
      ['tmdb:movie:3', media('tmdb:movie:3')],
      ['anilist:4', media('anilist:4')],
    ])
    const e = new Map([
      ['anilist:1', entry('anilist:1', { suggestedRating: 8 })],
      ['anilist:2', entry('anilist:2', { favorite: true })],
      ['tmdb:movie:3', entry('tmdb:movie:3', { rating: 9 })],
      ['anilist:4', entry('anilist:4', { rating: 6 })],
    ])
    const seeds = pickSeeds(e, m, prefs())
    expect(seeds.all.map((s) => s.media.id)).toEqual(['anilist:2', 'tmdb:movie:3', 'anilist:1'])
    expect(seeds.anime.map((s) => s.media.id)).toEqual(['anilist:2', 'anilist:1'])
    expect(pickSeeds(e, m, prefs({ kinds: ['movie'] })).all.map((s) => s.media.id)).toEqual(['tmdb:movie:3'])
  })
})

describe('taste profile', () => {
  it('scores titles by the genres the user liked and disliked', () => {
    const m = new Map([
      ['anilist:1', media('anilist:1', { genres: ['action'] })],
      ['anilist:2', media('anilist:2', { genres: ['romance'] })],
    ])
    const e = [entry('anilist:1', { rating: 10 }), entry('anilist:2', { rating: 1 })]
    const profile = tasteProfile(e, m)
    expect(contentScore(media('x', { genres: ['action'] }), profile)).toBeGreaterThan(0.9)
    expect(contentScore(media('y', { genres: ['romance'] }), profile)).toBeLessThan(0.2)
    expect(contentScore(media('z'), profile)).toBe(0.5)
  })
})

describe('buildRecs', () => {
  const seedMedia = new Map([
    ['anilist:1', media('anilist:1', { title: 'Frieren', genres: ['fantasy'] })],
    ['anilist:2', media('anilist:2', { title: 'Mushishi', genres: ['fantasy'] })],
    ['tmdb:movie:3', media('tmdb:movie:3', { title: 'Duna', genres: ['scifi'] })],
    ['anilist:50', media('anilist:50')],
  ])
  const entries = new Map([
    ['anilist:1', entry('anilist:1', { favorite: true })],
    ['anilist:2', entry('anilist:2', { suggestedRating: 8 })],
    ['tmdb:movie:3', entry('tmdb:movie:3', { rating: 9 })],
    // Already rejected: never recommended.
    ['anilist:50', entry('anilist:50', { status: 'reject' })],
  ])
  const rec = (id: number, votes: number, over: Partial<Media> = {}): Recommendation => ({
    media: media(`anilist:${id}`, { genres: ['fantasy'], score: 80, ...over }),
    votes,
  })
  const fetchers: RecsFetchers = {
    anime: async (ids) =>
      new Map(
        ids.map((id) => [
          id,
          id === 1
            ? [rec(10, 300), rec(11, 20), rec(50, 500)]
            : [rec(10, 100), rec(12, 40, { genres: ['horror'] })],
        ]),
      ),
    tmdb: async () => [media('tmdb:movie:20', { genres: ['scifi'], score: 75 }), media('tmdb:movie:21', { score: 60 })],
  }

  it('ranks titles recommended by several liked seeds first and explains why', async () => {
    const { cache, media: found } = await buildRecs(entries, seedMedia, prefs(), fetchers, 1000)
    expect(cache.ids[0]).toBe('anilist:10')
    expect(cache.ids).not.toContain('anilist:50')
    expect(cache.ids).toEqual(expect.arrayContaining(['anilist:11', 'anilist:12', 'tmdb:movie:20', 'tmdb:movie:21']))
    expect(cache.reasons['anilist:10']).toBe('Porque você favoritou Frieren')
    // The stored 9 shows as 8 on the 1 to 9 scale.
    expect(cache.reasons['tmdb:movie:20']).toBe('Porque você deu 8 para Duna')
    expect(found.map((m) => m.id)).toEqual(cache.ids)
    expect(cache.builtAt).toBe(1000)
  })

  it('applies the filters and the chosen kinds', async () => {
    const { cache } = await buildRecs(entries, seedMedia, prefs({ kinds: ['anime'], avoidGenres: ['horror'] }), fetchers)
    expect(cache.ids).toEqual(['anilist:10', 'anilist:11'])
  })

  it('never recommends hidden titles (later seasons of dropped anime)', async () => {
    const { cache } = await buildRecs(entries, seedMedia, prefs({ kinds: ['anime'] }), fetchers, 1000, new Set(['anilist:10']))
    expect(cache.ids).toEqual(['anilist:11', 'anilist:12'])
  })

  it('tolerates a failing source but not all of them', async () => {
    const broken: RecsFetchers = { ...fetchers, tmdb: async () => Promise.reject(new Error('offline')) }
    const partial = await buildRecs(entries, seedMedia, prefs(), broken)
    expect(partial.failures).toBe(1)
    expect(partial.cache.ids.length).toBeGreaterThan(0)
    const dead: RecsFetchers = { anime: async () => Promise.reject(new Error('down')), tmdb: broken.tmdb }
    await expect(buildRecs(entries, seedMedia, prefs(), dead)).rejects.toThrow('down')
  })

  it('goes stale when filters change or after a day', async () => {
    const { cache } = await buildRecs(entries, seedMedia, prefs(), fetchers, 1000)
    expect(isStale(cache, prefs(), 2000)).toBe(false)
    expect(isStale(cache, prefs({ sort: 'top' }), 2000)).toBe(true)
    expect(isStale(cache, prefs({ kinds: ['anime'] }), 2000)).toBe(true)
    expect(isStale(cache, prefs(), 1000 + 25 * 60 * 60 * 1000)).toBe(true)
  })
})
