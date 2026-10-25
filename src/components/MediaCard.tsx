import { ExternalLink, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { genreLabel } from '../genres'
import { KIND_BADGES } from '../prefs'
import type { Media, MediaKind } from '../types'

const ANIME_FORMAT: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV curto',
  MOVIE: 'Filme',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Especial',
}

export const KIND_SINGULAR: Record<MediaKind, string> = {
  anime: 'Anime',
  movie: 'Filme',
  series: 'Série',
  cartoon: 'Desenho',
}

// Links sit inside a draggable card; stop the drag from starting on them.
const stop = (e: React.PointerEvent) => e.stopPropagation()

function formatPart(m: Media) {
  if (m.kind === 'anime') return m.format && (ANIME_FORMAT[m.format] ?? m.format)
  if (m.kind === 'cartoon') return m.format === 'MOVIE' ? 'Filme' : 'Série'
  // Movies and series: the kind already says it.
  return undefined
}

export function formatScore(score: number) {
  return (score / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** "TV · 2019 · 26 ep · ★ 8,4"; with the kind first where no badge shows it. */
export function metaLine(m: Media, withKind = false) {
  return [
    withKind && KIND_SINGULAR[m.kind],
    formatPart(m),
    m.year,
    m.episodes && `${m.episodes} ep`,
    m.score && `★ ${formatScore(m.score)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** A smaller cover for lists; TMDB serves sizes by path, AniList covers are already light. */
export function coverThumb(m: Media) {
  return m.source === 'tmdb' ? m.cover.replace('/t/p/w500/', '/t/p/w185/') : m.cover
}

// Plain (no-CORS) loads on purpose: AniList answers requests without Origin with no CORS headers
// and no Vary, so a cover cached that way breaks any later CORS load of the same URL. The HTTP
// cache (31 days on AniList, a year on TMDB) keeps covers available offline instead.
interface CoverProps {
  src: string
  className?: string
  lazy?: boolean
  onError?: () => void
}

export function Cover({ src, className, lazy, onError }: CoverProps) {
  return (
    <img
      className={className}
      src={src}
      alt=""
      decoding="async"
      loading={lazy ? 'lazy' : undefined}
      draggable={false}
      onError={onError}
    />
  )
}

export function preloadCover(src: string) {
  new Image().src = src
}

const SOURCE_NAME = { anilist: 'AniList', tmdb: 'TMDB' } as const

interface Props {
  media: Media
  showDetails: boolean
  /** Why it is recommended (Para você tab). */
  reason?: string
  /** Shown above the title, like the suggested rating in the Avaliar tab. */
  note?: ReactNode
  /** Replaces the gesture hint at the bottom of the card. */
  hint?: string
}

export function MediaCard({ media, showDetails, reason, note, hint }: Props) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="media-card" style={{ backgroundColor: media.color ?? undefined }}>
      {broken ? (
        <div className="cover-fallback">{media.title}</div>
      ) : (
        <Cover className="media-cover" src={media.cover} onError={() => setBroken(true)} />
      )}
      <div className="card-top">
        <span className={`kind-badge kind-${media.kind}`}>{KIND_BADGES[media.kind]}</span>
        {media.links.crunchyroll && <span className="badge-cr">Crunchyroll</span>}
        {media.score !== undefined && <span className="score-badge">★ {formatScore(media.score)}</span>}
      </div>
      <div className={`media-info${showDetails ? ' open' : ''}`}>
        {note}
        {reason && (
          <p className="reason">
            <Sparkles strokeWidth={2.4} />
            {reason}
          </p>
        )}
        <h2>{media.title}</h2>
        {media.altTitle && <p className="alt-title">{media.altTitle}</p>}
        <p className="meta">{metaLine({ ...media, score: undefined })}</p>
        {showDetails ? (
          <>
            <p className="synopsis">{media.synopsis ?? 'Sem sinopse em português ainda.'}</p>
            <div className="links">
              {media.links.site && (
                <a href={media.links.site} target="_blank" rel="noreferrer" onPointerDown={stop}>
                  {SOURCE_NAME[media.source]} <ExternalLink />
                </a>
              )}
              {media.links.mal && (
                <a href={media.links.mal} target="_blank" rel="noreferrer" onPointerDown={stop}>
                  MyAnimeList <ExternalLink />
                </a>
              )}
              {media.links.crunchyroll && (
                <a href={media.links.crunchyroll} target="_blank" rel="noreferrer" onPointerDown={stop}>
                  Crunchyroll <ExternalLink />
                </a>
              )}
            </div>
          </>
        ) : (
          media.genres.length > 0 && (
            <div className="genres">
              {media.genres.slice(0, 4).map((g) => (
                <span key={g}>{genreLabel(g)}</span>
              ))}
            </div>
          )
        )}
        <p className="hint">{showDetails ? 'Toque para fechar' : (hint ?? 'Toque: sinopse · 2 toques: gostei · segurar: favorito')}</p>
      </div>
    </div>
  )
}
