import { Mail, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { APP_TAGLINE } from '../brand'
import { ALL_KINDS, DEFAULT_PREFS } from '../prefs'
import { useStore } from '../store'
import type { MediaKind } from '../types'
import { LogoMark, Wordmark } from './Logo'
import { KindTiles } from './PreferencesSheet'
import { SignInForm } from './SignInForm'

type Step = 'welcome' | 'signin' | 'kinds'

interface Props {
  /** Opened from an invite or profile link: friends need an account. */
  invited?: boolean
}

/**
 * First run: sign in or go on without an account, then pick what to classify, like choosing who to
 * see on a dating app. Signing in brings the library from the cloud first, and a returning account
 * skips the choice of kinds, since its preferences come along.
 */
export function Onboarding({ invited }: Props) {
  const { entries, setPrefs, cloud } = useStore()
  // People who used the anime-only version keep anime; everyone else starts with everything.
  const [kinds, setKinds] = useState<MediaKind[]>(entries.size > 0 ? ['anime'] : ALL_KINDS)
  const [step, setStep] = useState<Step>('welcome')
  const signedIn = Boolean(cloud.email)

  const view =
    cloud.status === 'off'
      ? 'kinds'
      : signedIn
        ? cloud.libraryReady
          ? 'kinds'
          : 'library'
        : cloud.status === 'loading'
          ? 'starting'
          : step

  return (
    <div className={`onboarding${view === 'kinds' ? '' : ' centered'}`}>
      <div className="onboarding-hero">
        <LogoMark />
        <h1>
          <Wordmark />
        </h1>
        <p>{APP_TAGLINE}</p>
      </div>

      {view === 'starting' && <div className="skeleton-line" aria-label="Carregando" />}

      {view === 'library' && (
        <div className="skeleton-card waiting welcome-wait" aria-label="Trazendo sua biblioteca">
          <span>Trazendo sua biblioteca da nuvem…</span>
        </div>
      )}

      {view === 'welcome' && (
        <div className="welcome">
          {invited && <p className="welcome-invite">Você recebeu um convite de amizade. Para aceitar, entre com seu e-mail.</p>}
          <button className="primary big" onClick={() => setStep('signin')}>
            <Mail /> Entrar com e-mail
          </button>
          <p className="welcome-note">Guarda tudo na nuvem, funciona em qualquer aparelho e libera a aba Amigos. Sem senha.</p>
          <button className="big" onClick={() => setStep('kinds')}>
            Continuar sem conta
          </button>
          <p className="welcome-warning">
            <TriangleAlert aria-hidden />
            <span>
              Sem conta, tudo fica só neste aparelho: se limpar os dados do navegador ou trocar de aparelho, você perde o
              que classificou. Dá para criar a conta depois em Configurações.
            </span>
          </p>
        </div>
      )}

      {view === 'signin' && (
        <div className="welcome cloud">
          <h2>Entrar com e-mail</h2>
          <SignInForm intro={<p className="muted">Chega um e-mail com um link e um código. Use qualquer um dos dois.</p>} />
          <div className="row center">
            <button className="link-btn" onClick={() => setStep('welcome')}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {view === 'kinds' && (
        <>
          {signedIn && (
            <p className="welcome-signed">
              Conectado como <strong>{cloud.email}</strong>
            </p>
          )}
          <h2>O que você quer classificar?</h2>
          <p className="muted">Escolha um ou mais. Dá para mudar quando quiser nas preferências.</p>
          <KindTiles kinds={kinds} onChange={setKinds} detailed />
          <button className="primary big" disabled={kinds.length === 0} onClick={() => setPrefs({ ...DEFAULT_PREFS, kinds })}>
            Começar
          </button>
          {!signedIn && cloud.status !== 'off' && (
            <div className="row center">
              <button className="link-btn" onClick={() => setStep('welcome')}>
                Voltar
              </button>
            </div>
          )}
        </>
      )}

      <p className="legal-note">
        Ao continuar, você concorda com os{' '}
        <a href="./termos.html" target="_blank" rel="noreferrer">
          Termos de Uso
        </a>{' '}
        e a{' '}
        <a href="./privacidade.html" target="_blank" rel="noreferrer">
          Política de Privacidade
        </a>
        .
      </p>
    </div>
  )
}
