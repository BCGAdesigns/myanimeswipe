import { useMemo, useState } from 'react'
import { DiscoverTab } from './components/DiscoverTab'
import { ListsTab } from './components/ListsTab'
import { RateTab } from './components/RateTab'
import { RecsTab } from './components/RecsTab'
import { Settings } from './components/Settings'
import { rateQueue } from './logic'
import { useStore } from './store'

type Tab = 'discover' | 'rate' | 'recs' | 'lists'

export function App() {
  const { entries, error, catalog, cloud } = useStore()
  const [tab, setTab] = useState<Tab>('discover')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const pending = useMemo(() => rateQueue(entries).length, [entries])

  return (
    <div className="app">
      <header>
        <h1>MyAnimeSwipe</h1>
        <div className="header-actions">
          {cloud.email && (
            <button
              className={`icon-btn cloud-status ${cloud.status}`}
              aria-label="Sincronização"
              title={cloud.status === 'error' ? (cloud.message ?? 'Erro ao sincronizar') : 'Sincronizado com a nuvem'}
              onClick={() => setSettingsOpen(true)}
            >
              {cloud.status === 'syncing' ? '⟳' : cloud.status === 'error' ? '⚠' : '☁'}
            </button>
          )}
          <button className="icon-btn" aria-label="Configurações" onClick={() => setSettingsOpen(true)}>
            ⚙
          </button>
        </div>
      </header>

      {/* Errors with cards still on screen would otherwise go unnoticed. */}
      {error && catalog.order.length > 0 && <div className="toast">{error}</div>}
      {/* A failed magic link lands here signed out; surface it without opening settings. */}
      {cloud.status === 'signed-out' && cloud.message && <div className="toast">{cloud.message}</div>}

      <main>
        {tab === 'discover' && <DiscoverTab />}
        {tab === 'rate' && <RateTab />}
        {tab === 'recs' && <RecsTab />}
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

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
