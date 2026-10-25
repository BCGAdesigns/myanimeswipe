import { Cloud, KeyRound, LogOut, Mail, RefreshCw } from 'lucide-react'
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
  const { cloud, signIn, verifyCode, signOut, syncNow } = useStore()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
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

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sentTo) return
    setSending(true)
    setError(null)
    try {
      await verifyCode(sentTo, code.trim())
      setSentTo(null)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  const notice = error ?? cloud.message

  return (
    <section className="section cloud">
      <h3>
        <Cloud /> Conta e sincronização
      </h3>
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
              <RefreshCw /> Sincronizar agora
            </button>
            <button onClick={() => void signOut()}>
              <LogOut /> Sair
            </button>
          </div>
        </>
      ) : sentTo ? (
        <>
          <p>
            Enviamos um e-mail para <strong>{sentTo}</strong>. Toque no link dele ou digite aqui o código que veio junto
            (com o app instalado na tela inicial, o código é o caminho mais garantido).
          </p>
          <form className="row" onSubmit={confirm}>
            <input
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              required
              placeholder="Código"
              aria-label="Código do e-mail"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button type="submit" className="primary" disabled={sending || code.length < 6}>
              <KeyRound /> {sending ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <div className="row">
            <button
              onClick={() => {
                setSentTo(null)
                setCode('')
                setError(null)
              }}
            >
              Usar outro e-mail
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Entre com seu e-mail para guardar seus dados na nuvem e usar em outros aparelhos. Sem senha: chega um link e
            um código.
          </p>
          <form className="row" onSubmit={send}>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="primary" disabled={sending}>
              <Mail /> {sending ? 'Enviando…' : 'Receber acesso por e-mail'}
            </button>
          </form>
        </>
      )}
      {notice && <p className="message">{notice}</p>}
    </section>
  )
}
