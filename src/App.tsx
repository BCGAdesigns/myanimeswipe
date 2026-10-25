import {
  Bookmark,
  Cloud,
  CloudAlert,
  Compass,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DiscoverTab } from './components/DiscoverTab'
import { FriendsTab } from './components/FriendsTab'
import { GestureGuide, guideSeen } from './components/GestureGuide'
import { ListsTab } from './components/ListsTab'
import { LogoMark, Wordmark } from './components/Logo'
import { Onboarding } from './components/Onboarding'
import { PreferencesSheet } from './components/PreferencesSheet'
import { RateTab } from './components/RateTab'
import { RecsTab } from './components/RecsTab'
import { SearchSheet } from './components/SearchSheet'
import { Settings } from './components/Settings'
import { myFriends } from './friends/api'
import { rateQueue } from './logic'
import { activeFilterCount } from './prefs'
import { useStore } from './store'

type Tab = 'discover' | 'rate' | 'recs' | 'lists' | 'friends'

const TABS: { id: Tab; label: string; Icon: typeof Compass }[] = [
  { id: 'discover', label: 'Descobrir', Icon: Compass },
  { id: 'rate', label: 'Avaliar', Icon: Star },
  { id: 'recs', label: 'Para você', Icon: Sparkles },
  { id: 'lists', label: 'Listas', Icon: Bookmark },
  { id: 'friends', label: 'Amigos', Icon: Users },
]

const params = new URLSearchParams(window.location.search)
/** An invite link (?amigo=username) opens the Friends tab with that person once. */
const invitedHandle = params.get('amigo')
if (invitedHandle) {
  params.delete('amigo')
  const rest = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
}

/** Home screen shortcuts open a tab directly (?tab=recs). */
function initialTab(): Tab {
  if (invitedHandle) return 'friends'
  const t = params.get('tab')
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'discover'
}

export function App() {
  const { ready, prefs, entries, error, cloud } = useStore()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [sheet, setSheet] = useState<'settings' | 'prefs' | 'guide' | 'search' | null>(null)
  const [guideDone, setGuideDone] = useState(guideSeen)
  const [friendHandle, setFriendHandle] = useState(invitedHandle)
  const [incomingRequests, setIncomingRequests] = useState(0)
  const clearFriendHandle = useCallback(() => setFriendHandle(null), [])

  // Badge for friend requests waiting for an answer, refreshed when the app comes back.
  useEffect(() => {
    if (!cloud.email) {
      setIncomingRequests(0)
      return
    }
    const check = () => {
      if (document.visibilityState !== 'visible') return
      myFriends()
        .then((rows) => setIncomingRequests(rows.filter((r) => r.state === 'incoming').length))
        .catch(() => {})
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [cloud.email])
  const pending = useMemo(() => rateQueue(entries).length, [entries])
  const filters = prefs ? activeFilterCount(prefs) : 0
  const openPrefs = () => setSheet('prefs')

  if (ready && !prefs) return <Onboarding />

  const CloudIcon = cloud.status === 'syncing' ? RefreshCw : cloud.status === 'error' ? CloudAlert : Cloud

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          <LogoMark />
          <Wordmark />
        </h1>
        <div className="header-actions">
          {cloud.email && (
            <button
              className={`icon-btn cloud-status ${cloud.status}`}
              aria-label="Sincronização"
              title={cloud.status === 'error' ? (cloud.message ?? 'Erro ao sincronizar') : 'Sincronizado com a nuvem'}
              onClick={() => setSheet('settings')}
            >
              <CloudIcon />
            </button>
          )}
          <button className="icon-btn" aria-label="Buscar" title="Buscar" onClick={() => setSheet('search')}>
            <Search />
          </button>
          <button className="icon-btn" aria-label="Preferências e filtros" title="Preferências e filtros" onClick={openPrefs}>
            <SlidersHorizontal />
            {filters > 0 && <span className="dot-count">{filters}</span>}
          </button>
          <button className="icon-btn" aria-label="Configurações" title="Configurações" onClick={() => setSheet('settings')}>
            <SettingsIcon />
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
        {tab === 'friends' && (
          <FriendsTab
            initialHandle={friendHandle}
            onInitialHandled={clearFriendHandle}
            onOpenSettings={() => setSheet('settings')}
            onRequestsChanged={setIncomingRequests}
          />
        )}
      </main>

      <nav className="tabbar">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            <Icon strokeWidth={tab === id ? 2.4 : 2} />
            {label}
            {id === 'rate' && pending > 0 && <span className="tab-badge">{pending}</span>}
            {id === 'friends' && incomingRequests > 0 && <span className="tab-badge">{incomingRequests}</span>}
          </button>
        ))}
      </nav>

      {sheet === 'settings' && (
        <Settings onClose={() => setSheet(null)} onOpenPrefs={openPrefs} onOpenGuide={() => setSheet('guide')} />
      )}
      {sheet === 'prefs' && <PreferencesSheet onClose={() => setSheet(null)} />}
      {sheet === 'search' && <SearchSheet onClose={() => setSheet(null)} />}
      {(sheet === 'guide' || (ready && !guideDone && tab === 'discover' && sheet === null)) && (
        <GestureGuide
          onClose={() => {
            setGuideDone(true)
            setSheet(null)
          }}
        />
      )}
    </div>
  )
}
