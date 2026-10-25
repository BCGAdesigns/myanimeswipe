import { Cloud, LogOut, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import type { CloudState } from '../sync/useCloudSync'
import { SignInForm } from './SignInForm'

const time = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function statusLine(cloud: CloudState) {
  if (cloud.status === 'syncing') return 'Sincronizando…'
  const parts: string[] = []
  if (cloud.lastSyncAt) parts.push(`Última sincronização às ${time(cloud.lastSyncAt)}`)
  if (cloud.pending) parts.push(`${cloud.pending} ${cloud.pending === 1 ? 'alteração pendente' : 'alterações pendentes'}`)
  return parts.join(' · ') || 'Aguardando a primeira sincronização.'
}

export function CloudSection() {
  const { cloud, signOut, syncNow } = useStore()

  if (cloud.status === 'off') return null

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
          {cloud.message && <p className="message">{cloud.message}</p>}
        </>
      ) : (
        <SignInForm
          intro={
            <p>
              Entre com seu e-mail para guardar seus dados na nuvem e usar em outros aparelhos. Sem senha: chega um link e
              um código.
            </p>
          }
        />
      )}
    </section>
  )
}
