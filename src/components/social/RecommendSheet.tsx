import { Check, Send } from 'lucide-react'
import { useState } from 'react'
import { recommend, type FriendTake } from '../../friends/api'
import { takeOf } from '../../friends/compare'
import { shortName } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import type { Media } from '../../types'
import { Sheet } from '../Sheet'
import { Avatar, errorText, PersonName, TakeChip } from './parts'

interface Props {
  media: Media
  /** What friends already did with the title, shown next to their names. */
  takes: FriendTake[]
  /** Friend ticked from the start (opened from their profile). */
  preselect?: string
  onClose: () => void
}

const NOTE_MAX = 280

export function RecommendSheet({ media, takes, preselect, onClose }: Props) {
  const { friends, refresh } = useSocial()
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(preselect ? [preselect] : []))
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const send = async () => {
    const targets = friends.filter((f) => chosen.has(f.userId))
    if (!targets.length) return
    setSending(true)
    setError(null)
    const results = await Promise.allSettled(targets.map((f) => recommend(f.userId, media, note.trim() || null)))
    const ok = targets.filter((_, i) => results[i].status === 'fulfilled')
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
    setSending(false)
    if (failed) setError(errorText(failed.reason))
    if (ok.length) {
      setDone(`Recomendado para ${ok.map(shortName).join(', ')}.`)
      setChosen(new Set())
      void refresh()
    }
  }

  return (
    <Sheet
      title={`Recomendar ${media.title}`}
      onClose={onClose}
      footer={
        <button className="primary" disabled={!chosen.size || sending} onClick={() => void send()}>
          <Send size={16} /> {sending ? 'Enviando…' : chosen.size > 1 ? `Enviar para ${chosen.size}` : 'Enviar'}
        </button>
      }
    >
      {friends.length === 0 ? (
        <p>Adicione amigos na aba Amigos para recomendar títulos.</p>
      ) : (
        <>
          <p>Escolha quem deve ver. Depois você acompanha se a pessoa colocou na lista, assistiu e que nota deu.</p>
          <ul className="friend-list pick-list">
            {friends.map((f) => {
              const take = takes.find((t) => t.userId === f.userId)
              const on = chosen.has(f.userId)
              return (
                <li key={f.userId}>
                  <button className={`friend${on ? ' picked' : ''}`} aria-pressed={on} onClick={() => toggle(f.userId)}>
                    <Avatar person={f} />
                    <PersonName person={f} sub={take ? 'Já tem na lista' : undefined} />
                    {take && <TakeChip take={takeOf(take)} />}
                    <span className="pick-box" aria-hidden>
                      {on && <Check size={15} strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <label className="field">
            Mensagem (opcional)
            <textarea
              className="code-field"
              value={note}
              maxLength={NOTE_MAX}
              rows={2}
              placeholder="Por que vale a pena?"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </>
      )}
      {done && <p className="message">{done}</p>}
      {error && <p className="message">{error}</p>}
    </Sheet>
  )
}
