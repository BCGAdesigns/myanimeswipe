// Ratings are shown from 1 to 8, one per drag direction in the Avaliar tab. Records keep the
// original 0 to 10 scale, so sync, recommendations, friends' lists and older app versions keep
// working unchanged; only what is shown and how new ratings are picked changed.

export const STARS = [1, 2, 3, 4, 5, 6, 7, 8] as const

/** Stored value for each shown rating (index 0 is 1). 3, 8 and 10 match the Discover gestures (Não gostei, Gostei, Favorito). */
const STORED = [0, 1, 3, 4, 6, 7, 8, 10]

/** Stored 0 to 10 to shown 1 to 8; old ratings land on the nearest step (8 and 9 both show 7). */
export function toStars(stored: number): number {
  return Math.min(8, Math.max(1, Math.round(stored * 0.7) + 1))
}

/** Shown 1 to 8 to the value that is saved. */
export function fromStars(stars: number): number {
  return STORED[Math.min(8, Math.max(1, Math.round(stars))) - 1]
}

/** Shown rating of a record, or null without one. */
export const shownRating = (stored: number | null | undefined) => (stored === null || stored === undefined ? null : toStars(stored))
