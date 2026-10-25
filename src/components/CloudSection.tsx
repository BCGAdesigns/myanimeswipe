import { useState } from 'react'
import { useStore } from '../store'
import type { CloudState } from '../sync/useCloudSync'

const time = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function statusLine(cloud: CloudState) {
  if (cloud.status === 'syncing') return 'Sincronizando…'
  const parts: string[] = []
  if (cloud.lastSyncAt) parts.push(`Última sincronização às ${time(cloud.lastSyncAt)}`)
  if (cloud.pending) parts.push(`${cloud.pending} ${cloud.pending === 1 ? 'alteração pendente' : 'alterações pendentes'}`)
  return parts.join(' · ') || 'Aguardando a primeira sincronização.'
}

export function CloudSection() {
  const { cloud, signIn, signOut, syncNow } = useStore()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (cloud.status === 'off') return null

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    setSending(true)
    setError(null)
    try {
      await signIn(address)
      setSentTo(address)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  const notice = error ?? cloud.message

  return (
    <section className="cloud">
      <h3>Conta e sincronização</h3>
      {cloud.status === 'loading' ? (
        <p>Carregando…</p>
      ) : cloud.email ? (
        <>
          <p>
            Conectado como <strong>{cloud.email}</strong>. Seus dados ficam neste aparelho e na nuvem.
          </p>
          <p>{statusLine(cloud)}</p>
          <div className="row">
            <button onClick={syncNow} disabled={cloud.status === 'syncing'}>
              Sincronizar agora
            </button>
            <button onClick={() => void signOut()}>Sair</button>
          </div>
        </>
      ) : sentTo ? (
        <>
          <p>
            Link enviado para <strong>{sentTo}</strong>. Abra o e-mail neste aparelho e toque no link para entrar.
          </p>
          <button onClick={() => setSentTo(null)}>Usar outro e-mail</button>
        </>
      ) : (
        <>
          <p>Entre com seu e-mail para guardar seus dados na nuvem e usar em outros aparelhos.</p>
          <form className="row" onSubmit={send}>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar link de acesso'}
            </button>
          </form>
        </>
      )}
      {notice && <p className="message">{notice}</p>}
    </section>
  )
}
