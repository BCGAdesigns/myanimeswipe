// Ratings are shown from 1 to 9. In the Avaliar tab the eight drag directions give 1 to 8, and a
// double tap or a long press gives 9, which is the same as a favorite. Records keep the original 0
// to 10 scale, so sync, recommendations and friends' lists keep working unchanged; only what is
// shown and how new ratings are picked changed.
import type { Entry } from './types'

export const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

/** The top rating: a double tap or a long press, and the same as marking a favorite. */
export const FAVORITE_STARS = 9

/** Stored value for each shown rating (index 0 is 1). 3, 8 and 10 match the Discover gestures (Não gostei, Gostei, Favorito). */
const STORED = [0, 1, 3, 4, 5, 6, 8, 9, 10]

/** Stored 0 to 10 to shown 1 to 9. */
export function toStars(stored: number): number {
  return Math.min(9, Math.max(1, Math.round(stored * 0.8) + 1))
}

/** Shown 1 to 9 to the value that is saved. */
export function fromStars(stars: number): number {
  return STORED[Math.min(9, Math.max(1, Math.round(stars))) - 1]
}

/** Shown rating of a record, or null without one. */
export const shownRating = (stored: number | null | undefined) => (stored === null || stored === undefined ? null : toStars(stored))

/** What each rating means, for the guide shown before rating and for the help. */
export const GRADES: { stars: number; label: string; when: string; move: string }[] = [
  { stars: 9, label: 'Favorito', when: 'Um dos melhores que você já viu. Entra nos favoritos.', move: '2 toques ou segurar' },
  { stars: 8, label: 'Excelente', when: 'Adorou e recomendaria sem pensar duas vezes.', move: '↑' },
  { stars: 7, label: 'Muito bom', when: 'Gostou bastante, com um ou outro defeito.', move: '↗' },
  { stars: 6, label: 'Bom', when: 'Valeu a pena, mas não marcou.', move: '→' },
  { stars: 5, label: 'Ok', when: 'Nem bom nem ruim: viu sem se empolgar.', move: '↘' },
  { stars: 4, label: 'Fraco', when: 'Mais defeitos que qualidades.', move: '↓' },
  { stars: 3, label: 'Ruim', when: 'Não gostou e não recomendaria.', move: '↙' },
  { stars: 2, label: 'Muito ruim', when: 'Se arrependeu de ter visto.', move: '←' },
  { stars: 1, label: 'Péssimo', when: 'Um dos piores que você já viu.', move: '↖' },
]

/**
 * When the scale went from 1 to 8 to 1 to 9 (9 = favorito). Every rating given before it goes back
 * to the Avaliar queue to be given again.
 */
export const RESCALE_AT = Date.UTC(2026, 9, 25, 19, 26)

/** How a record showed on the 1 to 8 scale. */
const oldStars = (stored: number) => Math.min(8, Math.max(1, Math.round(stored * 0.7) + 1))

/**
 * A rating given before the new scale goes back to the queue, with the number it used to show as
 * the suggestion (9 for favorites). Ratings given after RESCALE_AT are left alone, so this can run on
 * every device and after every sync without undoing anything. The version goes one step past the
 * old one, so any change made since, on any device, still wins.
 */
export function rescaled(e: Entry): Entry | null {
  if (e.rating === null || e.updatedAt >= RESCALE_AT) return null
  return {
    ...e,
    rating: null,
    suggestedRating: fromStars(e.favorite ? FAVORITE_STARS : oldStars(e.rating)),
    rev: (e.rev ?? e.updatedAt) + 1,
  }
}
