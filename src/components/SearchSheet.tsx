import { Clock3, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { searchLibrary } from '../library'
import { searchAnime } from '../sources/anilist'
import { searchTmdb, tmdbConfigured } from '../sources/tmdb'
import { useStore } from '../store'
import type { Media } from '../types'
import { MediaRow } from './MediaRow'
import { Sheet } from './Sheet'
import { TitleSheet } from './TitleSheet'

/** Waits for a pause in typing before asking the APIs (AniList allows about 30 requests a minute). */
const DEBOUNCE_MS = 350
const RECENT_KEY = 'watchmatch:recentSearches'

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function saveRecent(query: string) {
  try {
    const next = [query, ...readRecent().filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Only a convenience.
  }
}

interface Results {
  anime: Media[]
  other: Media[]
}

export function SearchSheet({ onClose }: { onClose: () => void }) {
  const { entries, media } = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results>({ anime: [], other: [] })
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Media | null>(null)
  const [recent, setRecent] = useState(readRecent)
  const request = useRef(0)
  const q = query.trim()

  const mine = useMemo(() => searchLibrary(q, entries, media), [q, entries, media])

  useEffect(() => {
    if (q.length < 2) {
      request.current++
      setResults({ anime: [], other: [] })
      setStatus('idle')
      setError(null)
      return
    }
    const id = ++request.current
    setStatus('loading')
    const timer = window.setTimeout(async () => {
      const [anime, other] = await Promise.allSettled([searchAnime(q), tmdbConfigured ? searchTmdb(q) : Promise.resolve([])])
      // A newer query is on its way; this answer is stale.
      if (id !== request.current) return
      setResults({
        anime: anime.status === 'fulfilled' ? anime.value : [],
        other: other.status === 'fulfilled' ? other.value : [],
      })
      const failed = [anime, other].filter((r) => r.status === 'rejected').length
      setError(failed === 2 ? 'Não consegui buscar agora. Confira a conexão.' : failed ? 'Parte da busca falhou; mostrando o que veio.' : null)
      setStatus('done')
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [q])

  const openTitle = (m: Media) => {
    if (q) {
      saveRecent(q)
      setRecent(readRecent())
    }
    setOpen(m)
  }

  // Titles already in the library show once, in their own section.
  const mineIds = new Set(mine.map((m) => m.id))
  const anime = results.anime.filter((m) => !mineIds.has(m.id))
  const other = results.other.filter((m) => !mineIds.has(m.id))
  const nothing = status === 'done' && !mine.length && !anime.length && !other.length

  return (
    <>
      <Sheet
        title="Buscar"
        onClose={onClose}
        className="tall"
        head={
          <div className="search-head">
            <label className="search-field">
              <Search />
              <input
                autoFocus
                type="search"
                enterKeyHint="search"
                placeholder="Anime, filme, série ou desenho"
                aria-label="Buscar títulos"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="icon-btn" aria-label="Limpar" onClick={() => setQuery('')}>
                  <X />
                </button>
              )}
            </label>
            <button className="link-btn" onClick={onClose}>
              Fechar
            </button>
          </div>
        }
      >
        {q.length < 2 ? (
          recent.length > 0 ? (
            <section className="search-section">
              <h4>Buscas recentes</h4>
              <div className="chip-wrap">
                {recent.map((r) => (
                  <button key={r} className="chip" onClick={() => setQuery(r)}>
                    <Clock3 size={13} /> {r}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="empty-state">
              <p className="empty-icon" aria-hidden>
                🔎
              </p>
              <p>Busque pelo nome em português, inglês ou no original. Dá para classificar direto do resultado.</p>
            </div>
          )
        ) : (
          <>
            {mine.length > 0 && (
              <section className="search-section">
                <h4>Na sua biblioteca</h4>
                <ul className="media-rows">
                  {mine.map((m) => (
                    <MediaRow key={m.id} media={m} entry={entries.get(m.id)} onOpen={openTitle} />
                  ))}
                </ul>
              </section>
            )}
            {status === 'loading' && <div className="search-loading" aria-label="Buscando" />}
            {error && <p className="banner">{error}</p>}
            {anime.length > 0 && (
              <section className="search-section">
                <h4>Anime</h4>
                <ul className="media-rows">
                  {anime.map((m) => (
                    <MediaRow key={m.id} media={m} entry={entries.get(m.id)} onOpen={openTitle} />
                  ))}
                </ul>
              </section>
            )}
            {other.length > 0 && (
              <section className="search-section">
                <h4>Filmes, séries e desenhos</h4>
                <ul className="media-rows">
                  {other.map((m) => (
                    <MediaRow key={m.id} media={m} entry={entries.get(m.id)} onOpen={openTitle} />
                  ))}
                </ul>
              </section>
            )}
            {nothing && (
              <div className="empty-state">
                <p className="empty-icon" aria-hidden>
                  🤷
                </p>
                <p>Nada encontrado para "{q}". Tente outro nome ou o título original.</p>
              </div>
            )}
          </>
        )}
      </Sheet>
      {open && <TitleSheet media={open} via="search" onClose={() => setOpen(null)} />}
    </>
  )
}
