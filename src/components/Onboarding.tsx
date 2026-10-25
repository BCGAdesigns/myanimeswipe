import { useState } from 'react'
import { APP_TAGLINE } from '../brand'
import { ALL_KINDS, DEFAULT_PREFS } from '../prefs'
import { useStore } from '../store'
import type { MediaKind } from '../types'
import { LogoMark, Wordmark } from './Logo'
import { KindTiles } from './PreferencesSheet'

/** First run: pick what to classify, like choosing who to see on a dating app. */
export function Onboarding() {
  const { entries, setPrefs } = useStore()
  // People who used the anime-only version keep anime; everyone else starts with everything.
  const [kinds, setKinds] = useState<MediaKind[]>(entries.size > 0 ? ['anime'] : ALL_KINDS)

  return (
    <div className="onboarding">
      <div className="onboarding-hero">
        <LogoMark />
        <h1>
          <Wordmark />
        </h1>
        <p>{APP_TAGLINE}</p>
      </div>
      <h2>O que você quer classificar?</h2>
      <p className="muted">Escolha um ou mais. Dá para mudar quando quiser nas preferências.</p>
      <KindTiles kinds={kinds} onChange={setKinds} detailed />
      <button className="primary big" disabled={kinds.length === 0} onClick={() => setPrefs({ ...DEFAULT_PREFS, kinds })}>
        Começar
      </button>
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
