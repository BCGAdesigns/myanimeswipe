import { useMemo, useState } from 'react'
import { APP_NAME } from './brand'
import { DiscoverTab } from './components/DiscoverTab'
import { ListsTab } from './components/ListsTab'
import { Onboarding } from './components/Onboarding'
import { PreferencesSheet } from './components/PreferencesSheet'
import { RateTab } from './components/RateTab'
import { RecsTab } from './components/RecsTab'
import { Settings } from './components/Settings'
import { rateQueue } from './logic'
import { activeFilterCount } from './prefs'
import { useStore } from './store'

type Tab = 'discover' | 'rate' | 'recs' | 'lists'

export function App() {
  const { ready, prefs, entries, error, cloud } = useStore()
  const [tab, setTab] = useState<Tab>('discover')
  const [sheet, setSheet] = useState<'settings' | 'prefs' | null>(null)
  const pending = useMemo(() => rateQueue(entries).length, [entries])
  const filters = prefs ? activeFilterCount(prefs) : 0
  const openPrefs = () => setSheet('prefs')

  if (ready && !prefs) return <Onboarding />

  return (
    <div className="app">
      <header>
        <h1>{APP_NAME}</h1>
        <div className="header-actions">
          {cloud.email && (
            <button
              className={`icon-btn cloud-status ${cloud.status}`}
              aria-label="Sincronização"
              title={cloud.status === 'error' ? (cloud.message ?? 'Erro ao sincronizar') : 'Sincronizado com a nuvem'}
              onClick={() => setSheet('settings')}
            >
              {cloud.status === 'syncing' ? '⟳' : cloud.status === 'error' ? '⚠' : '☁'}
            </button>
          )}
          <button className="icon-btn" aria-label="Preferências e filtros" onClick={openPrefs}>
            🎚{filters > 0 && <span className="dot-count">{filters}</span>}
          </button>
          <button className="icon-btn" aria-label="Configurações" onClick={() => setSheet('settings')}>
            ⚙
          </button>
        </div>
      </header>

      {error && <div className="toast">{error}</div>}
      {/* A failed magic link lands here signed out; surface it without opening settings. */}
      {cloud.status === 'signed-out' && cloud.message && <div className="toast">{cloud.message}</div>}

      <main>
        {tab === 'discover' && <DiscoverTab onOpenPrefs={openPrefs} />}
        {tab === 'rate' && <RateTab />}
        {tab === 'recs' && <RecsTab onOpenPrefs={openPrefs} />}
        {tab === 'lists' && <ListsTab />}
      </main>

      <nav>
        <button className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>
          Descobrir
        </button>
        <button className={tab === 'rate' ? 'active' : ''} onClick={() => setTab('rate')}>
          Avaliar{pending > 0 && <span className="count">{pending}</span>}
        </button>
        <button className={tab === 'recs' ? 'active' : ''} onClick={() => setTab('recs')}>
          Para você
        </button>
        <button className={tab === 'lists' ? 'active' : ''} onClick={() => setTab('lists')}>
          Listas
        </button>
      </nav>

      {sheet === 'settings' && <Settings onClose={() => setSheet(null)} />}
      {sheet === 'prefs' && <PreferencesSheet onClose={() => setSheet(null)} />}
    </div>
  )
}
