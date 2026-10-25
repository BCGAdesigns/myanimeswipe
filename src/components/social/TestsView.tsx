import { Check, ChevronLeft, FlaskConical, Minus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { answerTasteTest, createTasteTest, deleteTasteTest, type Person, type TasteTest } from '../../friends/api'
import { personName, shortName, timeAgo } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import { OPINION_LABEL, OPINIONS, pickTestItems, scoreTest, type Answers, type Closeness, type Opinion, type TestAnswer } from '../../friends/taste'
import { useStore } from '../../store'
import { Cover, coverThumb, metaLine } from '../MediaCard'
import { Sheet } from '../Sheet'
import { Avatar, CompatRing, errorText, PersonName } from './parts'

interface Props {
  /** Friend to start a test with right away (from their profile). */
  startWith: Person | null
  onStarted: () => void
  onOpenFriend: (p: Person) => void
}

export function TestsView({ startWith, onStarted, onOpenFriend }: Props) {
  const { tests, friends, friendList, refresh } = useSocial()
  const { entries, media } = useStore()
  const [picking, setPicking] = useState(false)
  const [playing, setPlaying] = useState<TasteTest | null>(null)
  const [result, setResult] = useState<TasteTest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async (friend: Person) => {
    setBusy(true)
    setError(null)
    try {
      const profile = await friendList(friend.userId)
      if (!profile) throw new Error('Essa amizade não está mais ativa.')
      const items = pickTestItems(entries, media, profile.entries)
      if (items.length < 3) {
        throw new Error(`Ainda não dá: vocês precisam ter visto pelo menos 3 títulos, somando os dois. Classifiquem mais alguns e tentem de novo.`)
      }
      const id = await createTasteTest(friend.userId, items)
      setPicking(false)
      setPlaying({
        ...friend,
        id,
        createdByMe: true,
        items,
        myAnswers: null,
        theirAnswers: null,
        myDone: false,
        theirDone: false,
        createdAt: new Date().toISOString(),
      })
      void refresh()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!startWith) return
    onStarted()
    void start(startWith)
    // Runs once per request from a profile.
  }, [startWith])

  const remove = async (t: TasteTest) => {
    if (!window.confirm(`Apagar o teste com ${personName(t)}? Ele some para os dois.`)) return
    try {
      await deleteTasteTest(t.id)
      await refresh()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const mine = tests.filter((t) => !t.myDone)
  const waiting = tests.filter((t) => t.myDone && !t.theirDone)
  const done = tests.filter((t) => t.myDone && t.theirDone)

  return (
    <div className="tests-view">
      <section className="section test-intro">
        <h3>
          <FlaskConical /> Teste de gosto
        </h3>
        <p>
          Vocês dois dizem o que acharam dos mesmos títulos, cada um no seu aparelho. Ninguém vê a resposta do outro antes
          de os dois terminarem; no fim aparece o quanto os gostos combinam, título por título.
        </p>
        <div className="row">
          <button className="primary" disabled={busy || friends.length === 0} onClick={() => setPicking(true)}>
            Novo teste
          </button>
        </div>
        {friends.length === 0 && <p className="small muted">Adicione um amigo para fazer o teste.</p>}
      </section>

      {busy && <div className="skeleton-line" aria-label="Montando o teste" />}

      {mine.length > 0 && (
        <TestGroup title="Sua vez" tests={mine} onOpenFriend={onOpenFriend} onRemove={remove} action="Responder" onAction={setPlaying} />
      )}
      {waiting.length > 0 && <TestGroup title="Esperando resposta" tests={waiting} onOpenFriend={onOpenFriend} onRemove={remove} />}
      {done.length > 0 && (
        <TestGroup title="Resultados" tests={done} onOpenFriend={onOpenFriend} onRemove={remove} action="Ver resultado" onAction={setResult} />
      )}

      {error && <p className="message center">{error}</p>}

      {picking && (
        <Sheet title="Fazer o teste com" onClose={() => setPicking(false)}>
          <ul className="friend-list">
            {friends.map((f) => (
              <li key={f.userId}>
                <button className="friend" disabled={busy} onClick={() => void start(f)}>
                  <Avatar person={f} />
                  <PersonName person={f} />
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="message">{error}</p>}
        </Sheet>
      )}
      {playing && (
        <TestPlay
          test={playing}
          onClose={() => setPlaying(null)}
          onSent={async () => {
            setPlaying(null)
            await refresh()
          }}
        />
      )}
      {result && <TestResult test={result} onClose={() => setResult(null)} />}
    </div>
  )
}

function TestGroup({
  title,
  tests,
  action,
  onAction,
  onRemove,
  onOpenFriend,
}: {
  title: string
  tests: TasteTest[]
  action?: string
  onAction?: (t: TasteTest) => void
  onRemove: (t: TasteTest) => void
  onOpenFriend: (p: Person) => void
}) {
  return (
    <section className="section">
      <h3>
        {title} <span className="muted">{tests.length}</span>
      </h3>
      <ul className="friend-list">
        {tests.map((t) => {
          const score = t.myAnswers && t.theirAnswers ? scoreTest(t.items, t.myAnswers, t.theirAnswers) : null
          return (
            <li key={t.id}>
              <button className="friend" onClick={() => (onAction ? onAction(t) : onOpenFriend(t))}>
                <Avatar person={t} />
                <PersonName person={t} sub={`${t.items.length} títulos · ${t.createdByMe ? 'você criou' : `criado por ${shortName(t)}`} · ${timeAgo(t.createdAt)}`} />
                {score?.taste != null && <span className="compat-chip">{score.taste}%</span>}
                {action && <span className="friend-go">{action}</span>}
              </button>
              <button className="icon-btn" aria-label={`Apagar teste com ${personName(t)}`} onClick={() => onRemove(t)}>
                <Trash2 />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function OpinionPicker({ value, onChange, label }: { value: Opinion | undefined; onChange: (o: Opinion) => void; label: string }) {
  return (
    <div className="opinions" role="radiogroup" aria-label={label}>
      {OPINIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`opinion ${o.id}${value === o.id ? ' on' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function TestPlay({ test, onClose, onSent }: { test: TasteTest; onClose: () => void; onSent: () => Promise<void> }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = shortName(test)
  const item = test.items[index]
  const answer: TestAnswer | undefined = answers[item.mediaId]
  const allDone = test.items.every((i) => answers[i.mediaId])
  const last = index === test.items.length - 1

  const choose = (opinion: Opinion) => {
    setAnswers((a) => ({ ...a, [item.mediaId]: { opinion } }))
    // Answered: move on by itself, like flipping a card.
    if (!last) window.setTimeout(() => setIndex((i) => Math.min(i + 1, test.items.length - 1)), 280)
  }

  const send = async () => {
    if (!allDone) return
    setSending(true)
    setError(null)
    try {
      await answerTasteTest(test.id, answers as Answers)
      await onSent()
    } catch (e) {
      setError(errorText(e))
      setSending(false)
    }
  }

  return (
    <Sheet title={`Teste com ${personName(test)}`} onClose={onClose} className="tall">
      <div className="progress" aria-label={`Pergunta ${index + 1} de ${test.items.length}`}>
        {test.items.map((i, n) => (
          <span key={i.mediaId} className={n <= index || answers[i.mediaId] ? 'on' : ''} />
        ))}
      </div>
      <div className="test-item">
        <Cover src={coverThumb(item.media)} />
        <div>
          <h3>{item.media.title}</h3>
          <p className="meta">{metaLine(item.media, true)}</p>
          <p className="small muted">
            {index + 1} de {test.items.length}
          </p>
        </div>
      </div>
      <h4 className="title-section">O que você achou?</h4>
      <OpinionPicker label="Sua opinião" value={answer?.opinion} onChange={choose} />
      <div className="row test-nav">
        <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ChevronLeft /> Voltar
        </button>
        {last ? (
          <button className="primary" disabled={!allDone || sending} onClick={() => void send()}>
            {sending ? 'Enviando…' : 'Enviar respostas'}
          </button>
        ) : (
          <button className="primary" disabled={!answer} onClick={() => setIndex(index + 1)}>
            Próximo
          </button>
        )}
      </div>
      {last && !allDone && <p className="small muted">Falta responder alguma pergunta. Use Voltar para conferir.</p>}
      <p className="small muted">
        Depois de enviar não dá para mudar. {name} responde no próprio aparelho, e um só vê as respostas do outro quando
        os dois terminarem.
      </p>
      {error && <p className="message">{error}</p>}
    </Sheet>
  )
}

function Mark({ closeness }: { closeness: Closeness | null }) {
  if (closeness === 'same') return <Check className="mark right" aria-label="mesma opinião" />
  if (closeness === 'close') return <Minus className="mark close" aria-label="opiniões próximas" />
  if (closeness === 'apart') return <X className="mark wrong" aria-label="opiniões opostas" />
  return null
}

function TestResult({ test, onClose }: { test: TasteTest; onClose: () => void }) {
  const score = useMemo(() => scoreTest(test.items, test.myAnswers ?? {}, test.theirAnswers ?? {}), [test])
  const name = shortName(test)
  return (
    <Sheet title={`Resultado com ${personName(test)}`} onClose={onClose} className="tall">
      <div className="test-score">
        <CompatRing value={score.taste} />
        <div>
          <h3>Gosto parecido</h3>
          <p>
            {score.taste === null
              ? 'Nenhum título visto pelos dois neste teste.'
              : `Mesma resposta em ${score.same} de ${score.bothSeen} ${score.bothSeen === 1 ? 'título que os dois viram' : 'títulos que os dois viram'}.`}
          </p>
        </div>
      </div>
      <ul className="test-answers">
        {score.items.map((r) => (
          <li key={r.item.mediaId}>
            <Cover src={coverThumb(r.item.media)} lazy />
            <div>
              <strong>{r.item.media.title}</strong>
              <p className="guesses">
                <span>Você: {r.mine ? OPINION_LABEL[r.mine] : '–'}</span>
                <span>
                  {name}: {r.theirs ? OPINION_LABEL[r.theirs] : '–'} <Mark closeness={r.closeness} />
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
