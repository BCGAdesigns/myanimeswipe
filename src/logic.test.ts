import { describe, expect, it } from 'vitest'
import { applyAction, buildDeck, classifyRateSwipe, classifySwipe, favoriteList, rateQueue, statusList } from './logic'
import { cleanSynopsis, toMedia } from './sources/anilist'
import type { Entry } from './types'

const at = (deg: number, dist = 200): [number, number] => {
  const r = (deg * Math.PI) / 180
  // Screen y grows downward, so "up" is negative dy.
  return [Math.cos(r) * dist, -Math.sin(r) * dist]
}

describe('classifySwipe', () => {
  it('maps the eight compass directions', () => {
    expect(classifySwipe(...at(0))).toBe('seen')
    expect(classifySwipe(...at(45))).toBe('watching')
    expect(classifySwipe(...at(90))).toBe('want')
    expect(classifySwipe(...at(135))).toBe('paused')
    expect(classifySwipe(...at(180))).toBe('skip')
    expect(classifySwipe(...at(-135))).toBe('dropped')
    expect(classifySwipe(...at(-90))).toBe('reject')
    expect(classifySwipe(...at(-45))).toBe('disliked')
  })

  it('gives every direction an equal 45° slice', () => {
    expect(classifySwipe(...at(20))).toBe('seen')
    expect(classifySwipe(...at(25))).toBe('watching')
    expect(classifySwipe(...at(110))).toBe('want')
    expect(classifySwipe(...at(115))).toBe('paused')
    expect(classifySwipe(...at(160))).toBe('skip')
    expect(classifySwipe(...at(-160))).toBe('skip')
    expect(classifySwipe(...at(-155))).toBe('dropped')
    expect(classifySwipe(...at(-70))).toBe('reject')
    expect(classifySwipe(...at(-25))).toBe('disliked')
  })

  it('ignores short drags', () => {
    expect(classifySwipe(...at(0, 30))).toBeNull()
  })
})

describe('classifyRateSwipe', () => {
  it('only knows confirm and skip', () => {
    expect(classifyRateSwipe(...at(0))).toBe('confirm')
    expect(classifyRateSwipe(...at(30))).toBe('confirm')
    expect(classifyRateSwipe(...at(180))).toBe('skip')
    expect(classifyRateSwipe(...at(90))).toBeNull()
  })
})

describe('applyAction', () => {
  it('suggests 8 for liked and 3 for disliked, both queued', () => {
    const liked = applyAction('a', 'liked', 'discover', 1)
    expect(liked).toMatchObject({ status: 'seen', rating: null, suggestedRating: 8, queuedAt: 1 })
    expect(applyAction('a', 'disliked', 'recs', 1)).toMatchObject({ status: 'seen', suggestedRating: 3 })
    expect(applyAction('a', 'seen', 'discover', 1)).toMatchObject({ status: 'seen', suggestedRating: null })
  })

  it('marks favorites as seen with 10 suggested', () => {
    expect(applyAction('a', 'favorite', 'discover', 1)).toMatchObject({
      status: 'seen',
      suggestedRating: 10,
      favorite: true,
      queuedAt: 1,
    })
  })

  it('keeps watching, paused and dropped out of the rating queue', () => {
    for (const action of ['watching', 'paused', 'dropped'] as const) {
      const e = applyAction('a', action, 'discover', 1)
      expect(e).toMatchObject({ status: action, suggestedRating: null })
      expect(rateQueue(new Map([['a', e]]))).toEqual([])
    }
  })
})

describe('buildDeck', () => {
  it('puts fresh cards first and skipped ones last, oldest skip first', () => {
    const entries = new Map<string, Entry>([
      ['a', applyAction('a', 'skip', 'discover', 20)],
      ['b', applyAction('b', 'want', 'discover', 5)],
      ['c', applyAction('c', 'skip', 'discover', 10)],
    ])
    expect(buildDeck(['a', 'b', 'c', 'd', 'e'], entries)).toEqual(['d', 'e', 'c', 'a'])
  })
})

describe('rateQueue', () => {
  it('lists unrated seen entries by queue time', () => {
    const entries = new Map<string, Entry>([
      ['a', applyAction('a', 'seen', 'discover', 30)],
      ['b', applyAction('b', 'liked', 'discover', 10)],
      ['c', { ...applyAction('c', 'seen', 'discover', 1), rating: 7 }],
      ['d', applyAction('d', 'want', 'discover', 2)],
    ])
    expect(rateQueue(entries).map((e) => e.mediaId)).toEqual(['b', 'a'])
  })
})

describe('statusList', () => {
  it('filters by status, newest first', () => {
    const entries = new Map<string, Entry>([
      ['a', applyAction('a', 'want', 'discover', 1)],
      ['b', applyAction('b', 'reject', 'discover', 2)],
      ['c', applyAction('c', 'want', 'recs', 3)],
    ])
    expect(statusList(entries, 'want').map((e) => e.mediaId)).toEqual(['c', 'a'])
    expect(statusList(entries, 'reject').map((e) => e.mediaId)).toEqual(['b'])
  })

  it('lists favorites regardless of status', () => {
    const entries = new Map<string, Entry>([
      ['a', applyAction('a', 'favorite', 'discover', 1)],
      ['b', { ...applyAction('b', 'favorite', 'discover', 2), rating: 9 }],
      ['c', applyAction('c', 'liked', 'discover', 3)],
    ])
    expect(favoriteList(entries).map((e) => e.mediaId)).toEqual(['b', 'a'])
  })
})

describe('anilist mapping', () => {
  it('strips html from synopsis', () => {
    expect(cleanSynopsis('Hello<br><br>\n<i>World</i> &amp; co')).toBe('Hello\n\nWorld & co')
  })

  it('detects Crunchyroll and builds MAL link', () => {
    const m = toMedia({
      id: 1,
      idMal: 2,
      siteUrl: 'https://anilist.co/anime/1',
      title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan' },
      coverImage: { extraLarge: 'x.jpg', large: null, color: '#fff' },
      format: 'TV',
      episodes: 25,
      seasonYear: 2013,
      genres: ['Action'],
      tags: [
        { name: 'Military', rank: 90, isMediaSpoiler: false },
        { name: 'Twist', rank: 80, isMediaSpoiler: true },
      ],
      averageScore: 85,
      description: null,
      externalLinks: [{ site: 'Crunchyroll', url: 'https://cr.example/aot', type: 'STREAMING' }],
    })
    expect(m.id).toBe('anilist:1')
    expect(m.title).toBe('Attack on Titan')
    expect(m.altTitle).toBe('Shingeki no Kyojin')
    expect(m.links.mal).toBe('https://myanimelist.net/anime/2')
    expect(m.links.crunchyroll).toBe('https://cr.example/aot')
    expect(m.tags).toEqual([{ name: 'Military', rank: 90 }])
  })
})
