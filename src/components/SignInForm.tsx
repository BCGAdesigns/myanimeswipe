import { KeyRound, Mail } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useStore } from '../store'

/** Sign in without a password: the e-mail, then the code from the same message (its link works too). */
export function SignInForm({ intro }: { intro?: ReactNode }) {
  const { cloud, signIn, verifyCode } = useStore()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    <>
      {sentTo ? (
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
          {intro}
          <form className="row" onSubmit={send}>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              aria-label="Seu e-mail"
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
    </>
  )
}
