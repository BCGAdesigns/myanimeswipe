import { useMemo } from 'react'
import { ratedList } from '../logic'
import { useStore } from '../store'

export function RecsTab() {
  const { entries } = useStore()
  const rated = useMemo(() => ratedList(entries).length, [entries])
  return (
    <div className="notice">
      <h2>Para você</h2>
      <p>
        As recomendações chegam na fase 2: o motor cruza as recomendações da comunidade AniList com seus gêneros e tags
        favoritos, pesando pelas suas notas. Os gestos serão os mesmos da aba Descobrir.
      </p>
      <p>Você já avaliou {rated} {rated === 1 ? 'anime' : 'animes'}. Quanto mais notas, melhores as recomendações.</p>
    </div>
  )
}
