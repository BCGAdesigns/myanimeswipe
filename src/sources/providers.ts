// Streaming services in Brazil, as TMDB (data by JustWatch) lists them. Ids, names and logos
// were checked against /watch/providers/{movie,tv}?watch_region=BR. AniList lists streaming
// links per title without a region, so for anime the match is by site name and global.

export interface Provider {
  id: number
  name: string
  /** TMDB logo path, served from image.tmdb.org. */
  logo: string
  /** AniList external link sites for the same service. */
  anilist: string[]
}

export const BR_PROVIDERS: Provider[] = [
  { id: 8, name: 'Netflix', logo: '/rK1KljqmbvO9HQa1PBFLILWah72.png', anilist: ['Netflix'] },
  { id: 119, name: 'Prime Video', logo: '/gMZdpavHmxFNnLpMHwVxfqeux2g.png', anilist: ['Amazon Prime Video', 'Prime Video'] },
  { id: 337, name: 'Disney+', logo: '/5eZ872CghnHFLB1j8grszbrx0dx.png', anilist: ['Disney Plus', 'Star+'] },
  { id: 1899, name: 'HBO Max', logo: '/skypuy7SXuugIQeYg0IglmzoKaS.png', anilist: ['Max'] },
  { id: 307, name: 'Globoplay', logo: '/9A6Oxd3F7iXm7mds7CxYOBicojs.png', anilist: [] },
  { id: 350, name: 'Apple TV', logo: '/9icYBfYFcwgCbky5VdGUIKJ4C5i.png', anilist: ['Apple TV+'] },
  { id: 531, name: 'Paramount+', logo: '/pkx3klJlwW5JdtaulvDx6hDNtch.png', anilist: [] },
  { id: 283, name: 'Crunchyroll', logo: '/uFL3c4Cq8M6WoLymlC5Y8bmGytV.png', anilist: ['Crunchyroll'] },
  { id: 167, name: 'Claro video', logo: '/zTJg0WVErBkcJv4S9FkQRUyXjnq.png', anilist: [] },
  { id: 11, name: 'MUBI', logo: '/k7iSlvgWzZuO4zU5PcBjhABMuia.png', anilist: [] },
  { id: 47, name: 'Looke', logo: '/jsAseYgBGuHRkl0sJs9AAQHHU8P.png', anilist: [] },
  { id: 300, name: 'Pluto TV', logo: '/fN4czqaMQNLeF6sSSIjGbAWzvwK.png', anilist: [] },
]

const BY_ID = new Map(BR_PROVIDERS.map((p) => [p.id, p]))

export function providerLogo(p: Provider, size: 'w45' | 'w92' = 'w92') {
  return `https://image.tmdb.org/t/p/${size}${p.logo}`
}

/** AniList site names for the chosen services; empty when none of them carries anime. */
export function anilistSites(providerIds: number[]): string[] {
  return [...new Set(providerIds.flatMap((id) => BY_ID.get(id)?.anilist ?? []))]
}
