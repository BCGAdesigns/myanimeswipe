import { describe, expect, it } from 'vitest'
import { applyAction, DISLIKED_RATING, FAVORITE_RATING, LIKED_RATING } from './logic'
import { FAVORITE_STARS, fromStars, RESCALE_AT, rescaled, shownRating, STARS, toStars } from './rating'
import type { Entry } from './types'

describe('ratings from 1 to 9', () => {
  it('saves every shown rating as a value that shows the same again', () => {
    for (const n of STARS) expect(toStars(fromStars(n))).toBe(n)
  })

  it('shows any 0 to 10 value on the nearest step', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(toStars)).toEqual([1, 2, 3, 3, 4, 5, 6, 7, 7, 8, 9])
    expect(shownRating(null)).toBeNull()
  })

  it('keeps the Discover gestures on the scale: liked 7, disliked 3, favorite 9', () => {
    expect([LIKED_RATING, DISLIKED_RATING, FAVORITE_RATING].map(toStars)).toEqual([7, 3, FAVORITE_STARS])
    expect([7, 3, 9].map(fromStars)).toEqual([LIKED_RATING, DISLIKED_RATING, FAVORITE_RATING])
  })

  it('saves higher ratings as higher values, so sorting and recommendations keep their order', () => {
    const saved = STARS.map(fromStars)
    expect([...saved].sort((a, b) => a - b)).toEqual(saved)
    expect(new Set(saved).size).toBe(9)
  })
})

describe('moving ratings from the 1 to 8 scale', () => {
  const before = RESCALE_AT - 86_400_000
  const rated = (stored: number, over: Partial<Entry> = {}): Entry => ({
    ...applyAction('anilist:1', 'seen', 'discover', before),
    rating: stored,
    rev: before,
    ...over,
  })

  it('sends an old rating back to the queue, suggesting the number it used to show', () => {
    // On the old scale the stored 10 showed 8, 8 showed 7, 7 showed 6 and 6 showed 5.
    const shownBefore = { 10: 8, 8: 7, 7: 6, 6: 5, 4: 4, 3: 3, 1: 2, 0: 1 }
    for (const [stored, shown] of Object.entries(shownBefore)) {
      const next = rescaled(rated(Number(stored)))!
      expect(next.rating).toBeNull()
      expect(next.status).toBe('seen')
      expect(toStars(next.suggestedRating!)).toBe(shown)
    }
  })

  it('suggests 9 for favorites', () => {
    expect(toStars(rescaled(rated(6, { favorite: true }))!.suggestedRating!)).toBe(9)
  })

  it('moves the version one step, so any later change on another device still wins', () => {
    expect(rescaled(rated(8))!.rev).toBe(before + 1)
    expect(rescaled(rated(8, { rev: undefined }))!.rev).toBe(before + 1)
  })

  it('leaves alone ratings given on the new scale, titles without a rating and its own result', () => {
    expect(rescaled(rated(8, { updatedAt: RESCALE_AT + 1 }))).toBeNull()
    expect(rescaled(rated(8, { rating: null }))).toBeNull()
    expect(rescaled(rescaled(rated(8))!)).toBeNull()
  })
})
