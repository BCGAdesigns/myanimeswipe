import { ArrowDownUp, Equal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { COMMON_ORDER_LABELS, sortCommon, type CommonOrder, type CommonTitle, type Comparison, type Suggestion } from '../../friends/compare'
import { compatLabel, decimal } from '../../friends/feed'
import type { Media } from '../../types'
import { Cover, coverThumb, KIND_SINGULAR } from '../MediaCard'
import { TakeChip } from './parts'

interface Props {
  /** The friend's first name. */
  name: string
  comparison: Comparison
  onOpen: (m: Media) => void
}

const ORDERS = Object.keys(COMMON_ORDER_LABELS) as CommonOrder[]

function summary(c: Comparison): string {
  if (c.ratedTogether > 0 && c.meanGap !== null) {
    const titles = c.ratedTogether === 1 ? 'título' : 'títulos'
    const gap = `diferença média de ${decimal(c.meanGap)} ${c.meanGap === 1 ? 'ponto' : 'pontos'}`
    const same = c.sameRating ? `, ${c.sameRating} ${c.sameRating === 1 ? 'nota igual' : 'notas iguais'}` : ''
    return `Vocês deram nota para ${c.ratedTogether} ${titles} em comum: ${gap}${same}.`
  }
  if (c.compatibility !== null) return 'Calculado pelo que cada um curtiu ou largou. Deem notas aos títulos em comum para ficar mais preciso.'
  return 'Deem nota a alguns títulos em comum para medir a compatibilidade.'
}

export function CompareView({ name, comparison: c, onOpen }: Props) {
  const nothing =
    !c.common.length && !c.theyRecommend.length && !c.youRecommend.length && !c.bothWant.length && !c.youCanTell.length

  return (
    <div className="compare">
      <section className="section compare-summary">
        <h3>{c.compatibility === null ? 'Compatibilidade ainda sem medida' : `${c.compatibility}% · ${compatLabel(c.compatibility)}`}</h3>
        <p>{summary(c)}</p>
      </section>

      <PosterRow title="Vocês dois querem ver" hint="Bons candidatos para assistirem juntos." ids={c.bothWant} media={c.media} onOpen={onOpen} />
      <PosterRow title="Assistindo ao mesmo tempo" ids={c.bothWatching} media={c.media} onOpen={onOpen} />
      <PosterRow
        title={`${name} recomenda para você`}
        hint="O que mais agradou e combina com o seu gosto."
        suggestions={c.theyRecommend}
        media={c.media}
        onOpen={onOpen}
      />
      <PosterRow
        title={`Você recomenda para ${name}`}
        hint={`Do que você mais gostou, o que combina com ${name}. Abra um título para mandar a indicação.`}
        suggestions={c.youRecommend}
        media={c.media}
        onOpen={onOpen}
      />
      <PosterRow
        title={`Na lista de ${name}, e você já viu`}
        hint="Conte o que achou."
        suggestions={c.youCanTell}
        media={c.media}
        onOpen={onOpen}
      />
      <PosterRow title="Os dois amaram" ids={c.bothLoved} media={c.media} onOpen={onOpen} />
      {c.disagree.length > 0 && <TitleList title="Onde vocês discordam" rows={c.disagree.slice(0, 10)} name={name} media={c.media} onOpen={onOpen} />}
      {c.common.length > 0 && <SideBySide list={c.common} name={name} media={c.media} onOpen={onOpen} />}

      {nothing && (
        <div className="empty-state">
          <p>Nada em comum por enquanto. Classifiquem mais títulos e voltem aqui.</p>
        </div>
      )}
    </div>
  )
}

function PosterRow({
  title,
  hint,
  ids,
  suggestions,
  media,
  onOpen,
}: {
  title: string
  hint?: string
  ids?: string[]
  suggestions?: Suggestion[]
  media: Map<string, Media>
  onOpen: (m: Media) => void
}) {
  const list = suggestions ?? (ids ?? []).map((id) => ({ id, take: null, fit: 0 }))
  if (!list.length) return null
  return (
    <section className="compare-row">
      <h4>
        {title} <span>{list.length}</span>
      </h4>
      {hint && <p className="compare-hint">{hint}</p>}
      <div className="poster-row">
        {list.slice(0, 30).map(({ id, take }) => {
          const m = media.get(id)
          if (!m) return null
          return (
            <button key={id} className="poster" onClick={() => onOpen(m)}>
              <span className="poster-cover">
                <Cover src={coverThumb(m)} lazy />
                {take && (take.rating !== null || take.favorite) && <TakeChip take={take} />}
              </span>
              <span className="poster-title">{m.title}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function TitleList({
  title,
  rows,
  name,
  media,
  onOpen,
}: {
  title: string
  rows: CommonTitle[]
  name: string
  media: Map<string, Media>
  onOpen: (m: Media) => void
}) {
  return (
    <section className="compare-row">
      <h4>
        {title} <span>{rows.length}</span>
      </h4>
      <ul className="sbs-list">
        {rows.map((row) => (
          <SideRow key={row.id} row={row} name={name} media={media} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  )
}

function SideRow({ row, name, media, onOpen }: { row: CommonTitle; name: string; media: Map<string, Media>; onOpen: (m: Media) => void }) {
  const m = media.get(row.id)
  if (!m) return null
  return (
    <li>
      <button className="sbs-row" onClick={() => onOpen(m)}>
        <Cover src={coverThumb(m)} lazy />
        <span className="sbs-title">
          {m.title}
          <small>{[KIND_SINGULAR[m.kind], m.year].filter(Boolean).join(' · ')}</small>
        </span>
        <TakeChip take={row.mine} label="Você" />
        <span className={`sbs-gap${row.gap === 0 ? ' same' : ''}`} aria-hidden>
          {row.gap === 0 ? <Equal size={14} /> : row.gap !== null ? `±${row.gap}` : ''}
        </span>
        <TakeChip take={row.theirs} label={name} />
      </button>
    </li>
  )
}

function SideBySide({ list, name, media, onOpen }: { list: CommonTitle[]; name: string; media: Map<string, Media>; onOpen: (m: Media) => void }) {
  const [order, setOrder] = useState<CommonOrder>('similar')
  const [limit, setLimit] = useState(20)
  const sorted = useMemo(() => sortCommon(list, order), [list, order])
  return (
    <section className="compare-row side-by-side">
      <div className="sbs-head">
        <h4>
          Notas lado a lado <span>{list.length}</span>
        </h4>
        <label className="sort-select">
          <ArrowDownUp />
          <select aria-label="Ordenar notas" value={order} onChange={(e) => setOrder(e.target.value as CommonOrder)}>
            {ORDERS.map((o) => (
              <option key={o} value={o}>
                {o === 'theirs' ? `Maior nota de ${name}` : COMMON_ORDER_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sbs-legend" aria-hidden>
        <span>Você</span>
        <span>{name}</span>
      </div>
      <ul className="sbs-list">
        {sorted.slice(0, limit).map((row) => (
          <SideRow key={row.id} row={row} name={name} media={media} onOpen={onOpen} />
        ))}
      </ul>
      {sorted.length > limit && (
        <div className="row center">
          <button className="link-btn" onClick={() => setLimit((l) => l + 30)}>
            Mostrar mais ({sorted.length - limit})
          </button>
        </div>
      )}
    </section>
  )
}
