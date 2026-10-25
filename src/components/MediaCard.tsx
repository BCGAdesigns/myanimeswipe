import type { Media } from '../types'

const FORMAT_LABEL: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV curto',
  MOVIE: 'Filme',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Especial',
}

// Links sit inside a draggable card; stop the drag from starting on them.
const stop = (e: React.PointerEvent) => e.stopPropagation()

export function metaLine(m: Media) {
  return [
    m.format && (FORMAT_LABEL[m.format] ?? m.format),
    m.year,
    m.episodes && `${m.episodes} ep`,
    m.score && `★ ${(m.score / 10).toFixed(1)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function MediaCard({ media, showDetails }: { media: Media; showDetails: boolean }) {
  return (
    <div className="media-card" style={{ backgroundColor: media.color ?? '#222' }}>
      <img className="media-cover" src={media.cover} alt="" draggable={false} />
      {media.links.crunchyroll && <span className="badge-cr">Crunchyroll</span>}
      <div className="media-info">
        <h2>{media.title}</h2>
        {media.altTitle && <p className="alt-title">{media.altTitle}</p>}
        <p className="meta">{metaLine(media)}</p>
        {showDetails ? (
          <>
            {media.synopsis && <p className="synopsis">{media.synopsis}</p>}
            <div className="links">
              {media.links.mal && (
                <a href={media.links.mal} target="_blank" rel="noreferrer" onPointerDown={stop}>
                  MyAnimeList
                </a>
              )}
              {media.links.site && (
                <a href={media.links.site} target="_blank" rel="noreferrer" onPointerDown={stop}>
                  AniList
                </a>
              )}
              {media.links.crunchyroll && (
                <a href={media.links.crunchyroll} target="_blank" rel="noreferrer" onPointerDown={stop}>
                  Crunchyroll
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="genres">
            {media.genres.slice(0, 4).map((g) => (
              <span key={g}>{g}</span>
            ))}
          </div>
        )}
        <p className="hint">{showDetails ? 'Toque para fechar' : 'Toque para ver a sinopse'}</p>
      </div>
    </div>
  )
}
