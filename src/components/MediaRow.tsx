import { ChevronRight, Star } from 'lucide-react'
import type { Entry, Media } from '../types'
import { Cover, coverThumb, metaLine } from './MediaCard'
import { statusText } from './TitleSheet'

/** One title in a list (search results, friends): tap opens its sheet. */
export function MediaRow({ media, entry, onOpen }: { media: Media; entry?: Entry; onOpen: (m: Media) => void }) {
  return (
    <li>
      <button className="media-row" onClick={() => onOpen(media)}>
        <Cover src={coverThumb(media)} lazy />
        <span className="media-row-body">
          <span className="media-row-title">
            {entry?.favorite && <Star className="fav-star" size={13} fill="currentColor" />} {media.title}
          </span>
          <span className="media-row-meta">{metaLine(media, true)}</span>
          {entry && <span className="media-row-status">{statusText(entry)}</span>}
        </span>
        <ChevronRight className="media-row-go" />
      </button>
    </li>
  )
}
