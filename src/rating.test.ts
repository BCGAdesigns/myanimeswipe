import { describe, expect, it } from 'vitest'
import { DISLIKED_RATING, FAVORITE_RATING, LIKED_RATING } from './logic'
import { fromStars, shownRating, STARS, toStars } from './rating'

describe('ratings from 1 to 8', () => {
  it('saves every shown rating as a value that shows the same again', () => {
    for (const n of STARS) expect(toStars(fromStars(n))).toBe(n)
  })

  it('shows old 0 to 10 ratings on the nearest step', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(toStars)).toEqual([1, 2, 2, 3, 4, 5, 5, 6, 7, 7, 8])
    expect(shownRating(null)).toBeNull()
  })

  it('keeps the Discover gestures on the scale: liked 7, disliked 3, favorite 8', () => {
    expect([LIKED_RATING, DISLIKED_RATING, FAVORITE_RATING].map(toStars)).toEqual([7, 3, 8])
    expect([7, 3, 8].map(fromStars)).toEqual([LIKED_RATING, DISLIKED_RATING, FAVORITE_RATING])
  })

  it('saves higher ratings as higher values, so sorting and recommendations keep their order', () => {
    const saved = STARS.map(fromStars)
    expect([...saved].sort((a, b) => a - b)).toEqual(saved)
    expect(new Set(saved).size).toBe(8)
  })
})
