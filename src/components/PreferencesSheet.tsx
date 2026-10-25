import { Check, Crown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { GENRES } from '../genres'
import {
  ALL_ANIME_FORMATS,
  ALL_KINDS,
  DEFAULT_PREFS,
  KIND_ICONS,
  KIND_LABELS,
  PREMIUM_FILTERS_UNLOCKED,
  type AnimeFormat,
  type Preferences,
  type SortMode,
} from '../prefs'
import { BR_PROVIDERS, providerLogo } from '../sources/providers'
import { useStore } from '../store'
import type { MediaKind } from '../types'
import { Sheet } from './Sheet'

const SORTS: { value: SortMode; label: string }[] = [
  { value: 'popular', label: 'Populares' },
  { value: 'top', label: 'Melhor nota' },
  { value: 'recent', label: 'Lançamentos' },
]

const FORMAT_LABEL: Record<AnimeFormat, string> = {
  TV: 'TV',
  TV_SHORT: 'TV curto',
  MOVIE: 'Filme',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Especial',
}

const LANGUAGES: [string, string][] = [
  ['en', 'Inglês'],
  ['pt', 'Português'],
  ['es', 'Espanhol'],
  ['ko', 'Coreano'],
  ['ja', 'Japonês'],
  ['fr', 'Francês'],
  ['it', 'Italiano'],
  ['de', 'Alemão'],
  ['hi', 'Hindi'],
  ['zh', 'Chinês'],
]

const EPISODES = [12, 26, 52, 100]
const RUNTIMES = [90, 120, 150, 180]
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: THIS_YEAR + 2 - 1920 }, (_, i) => THIS_YEAR + 1 - i)

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

const numOrNull = (v: string) => (v === '' ? null : Number(v))

const KIND_HINTS: Record<MediaKind, string> = {
  anime: 'Do AniList, com notas da comunidade',
  movie: 'Lançamentos e clássicos',
  series: 'Live action do mundo todo',
  cartoon: 'Animação ocidental, séries e filmes',
}

export function KindTiles({
  kinds,
  onChange,
  detailed,
}: {
  kinds: MediaKind[]
  onChange: (kinds: MediaKind[]) => void
  /** Show a one-line description under each kind (first run). */
  detailed?: boolean
}) {
  return (
    <div className="kind-tiles">
      {ALL_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          className={`kind-tile${kinds.includes(k) ? ' on' : ''}`}
          aria-pressed={kinds.includes(k)}
          onClick={() => onChange(toggle(kinds, k))}
        >
          <span className="kind-icon" aria-hidden>
            {KIND_ICONS[k]}
          </span>
          <span>
            {KIND_LABELS[k]}
            {detailed && <small>{KIND_HINTS[k]}</small>}
          </span>
          <span className="check" aria-hidden>
            <Check strokeWidth={3} />
          </span>
        </button>
      ))}
    </div>
  )
}

export function PreferencesSheet({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useStore()
  const [draft, setDraft] = useState<Preferences>(prefs ?? DEFAULT_PREFS)
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const has = (k: MediaKind) => draft.kinds.includes(k)
  const tmdbKinds = has('movie') || has('series') || has('cartoon')
  const genres = useMemo(
    () =>
      GENRES.filter(
        (g) =>
          (g.anilist && draft.kinds.includes('anime')) ||
          (g.tmdbMovie && (draft.kinds.includes('movie') || draft.kinds.includes('cartoon'))) ||
          (g.tmdbTv && (draft.kinds.includes('series') || draft.kinds.includes('cartoon'))),
      ),
    [draft.kinds],
  )

  const changed = JSON.stringify({ ...draft, updatedAt: 0 }) !== JSON.stringify({ ...(prefs ?? DEFAULT_PREFS), updatedAt: 0 })
  const valid = draft.kinds.length > 0

  const apply = () => {
    if (valid && changed) setPrefs(draft)
    onClose()
  }

  return (
    <Sheet
      title="Preferências"
      onClose={apply}
      footer={
        <>
          <button onClick={() => setDraft({ ...DEFAULT_PREFS, kinds: draft.kinds })}>Restaurar filtros</button>
          <button className="primary" disabled={!valid} onClick={apply}>
            {changed ? 'Aplicar' : 'Pronto'}
          </button>
        </>
      }
    >
      <section className="pref-section">
        <h3>O que classificar</h3>
        <KindTiles kinds={draft.kinds} onChange={(kinds) => set('kinds', kinds)} />
        {!valid && <p className="field-hint warn">Escolha pelo menos um tipo.</p>}
      </section>

      <div className="pro-head">
        <h3>Filtros avançados</h3>
        <span className="pro-badge">
          <Crown strokeWidth={2.6} /> PRO
        </span>
        {PREMIUM_FILTERS_UNLOCKED && <span className="pro-free">grátis por enquanto</span>}
      </div>

      <fieldset className="pro-fields" disabled={!PREMIUM_FILTERS_UNLOCKED}>
        <section className="pref-section">
          <h4>Ordenar por</h4>
          <div className="segmented" role="radiogroup">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={draft.sort === s.value}
                className={draft.sort === s.value ? 'on' : ''}
                onClick={() => set('sort', s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section className="pref-section">
          <h4>Ano de lançamento</h4>
          <div className="field-row">
            <label>
              De
              <select value={draft.yearMin ?? ''} onChange={(e) => set('yearMin', numOrNull(e.target.value))}>
                <option value="">Qualquer</option>
                {YEARS.filter((y) => !draft.yearMax || y <= draft.yearMax).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Até
              <select value={draft.yearMax ?? ''} onChange={(e) => set('yearMax', numOrNull(e.target.value))}>
                <option value="">Qualquer</option>
                {YEARS.filter((y) => !draft.yearMin || y >= draft.yearMin).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="pref-section">
          <h4>
            Nota mínima da comunidade{' '}
            <span className="value">
              {draft.minScore ? `${(draft.minScore / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}+` : 'Qualquer'}
            </span>
          </h4>
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={draft.minScore ?? 0}
            aria-label="Nota mínima"
            onChange={(e) => set('minScore', Number(e.target.value) || null)}
          />
        </section>

        <section className="pref-section">
          <h4>Gêneros que você quer evitar</h4>
          <div className="chip-wrap">
            {genres.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`chip${draft.avoidGenres.includes(g.key) ? ' avoid' : ''}`}
                aria-pressed={draft.avoidGenres.includes(g.key)}
                onClick={() => set('avoidGenres', toggle(draft.avoidGenres, g.key))}
              >
                {g.label}
              </button>
            ))}
          </div>
        </section>

        {has('anime') && (
          <section className="pref-section">
            <h4>Anime</h4>
            <div className="chip-wrap">
              {ALL_ANIME_FORMATS.map((f) => {
                const on = draft.animeFormats.includes(f)
                return (
                  <button
                    key={f}
                    type="button"
                    className={`chip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const next = toggle(draft.animeFormats, f)
                      set('animeFormats', next.length ? next : ALL_ANIME_FORMATS)
                    }}
                  >
                    {FORMAT_LABEL[f]}
                  </button>
                )
              })}
            </div>
            <label className="field">
              Máximo de episódios
              <select value={draft.maxEpisodes ?? ''} onChange={(e) => set('maxEpisodes', numOrNull(e.target.value))}>
                <option value="">Sem limite</option>
                {EPISODES.map((n) => (
                  <option key={n} value={n}>
                    Até {n}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {(has('movie') || has('cartoon')) && (
          <section className="pref-section">
            <label className="field">
              Duração máxima dos filmes
              <select value={draft.maxRuntime ?? ''} onChange={(e) => set('maxRuntime', numOrNull(e.target.value))}>
                <option value="">Sem limite</option>
                {RUNTIMES.map((n) => (
                  <option key={n} value={n}>
                    Até {Math.floor(n / 60)}h{n % 60 ? `${n % 60}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {tmdbKinds && (
          <section className="pref-section">
            <h4>Idioma original</h4>
            <p className="field-hint">Vale para filmes, séries e desenhos. Nenhum marcado: qualquer idioma.</p>
            <div className="chip-wrap">
              {LANGUAGES.map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className={`chip${draft.languages.includes(code) ? ' on' : ''}`}
                  aria-pressed={draft.languages.includes(code)}
                  onClick={() => set('languages', toggle(draft.languages, code))}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="pref-section">
          <h4>Streaming no Brasil</h4>
          <label className="switch-row">
            <span>Só o que dá para assistir em streaming</span>
            <input
              type="checkbox"
              role="switch"
              checked={draft.streamingOnly || draft.providers.length > 0}
              onChange={(e) => {
                set('streamingOnly', e.target.checked)
                if (!e.target.checked) set('providers', [])
              }}
            />
          </label>
          <p className="field-hint">Escolha serviços para ver só o que está neles. Para anime, a informação vem do AniList e não é por país.</p>
          <div className="provider-grid">
            {BR_PROVIDERS.map((p) => {
              const on = draft.providers.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`provider${on ? ' on' : ''}`}
                  aria-pressed={on}
                  title={p.name}
                  onClick={() => set('providers', toggle(draft.providers, p.id))}
                >
                  <img src={providerLogo(p)} alt="" loading="lazy" />
                  <span>{p.name}</span>
                </button>
              )
            })}
          </div>
          <p className="field-hint after">Dados de streaming: JustWatch, via TMDB.</p>
        </section>
      </fieldset>
    </Sheet>
  )
}
