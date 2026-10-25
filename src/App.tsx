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
import { useCallback, useMemo, useState } from 'react'
import { DiscoverTab } from './components/DiscoverTab'
import { GestureGuide, guideSeen } from './components/GestureGuide'
import { ListsTab } from './components/ListsTab'
import { LogoMark, Wordmark } from './components/Logo'
import { Onboarding } from './components/Onboarding'
import { PreferencesSheet } from './components/PreferencesSheet'
import { RateTab } from './components/RateTab'
import { RatingGuide } from './components/RatingGuide'
import { RecsTab } from './components/RecsTab'
import { SearchSheet } from './components/SearchSheet'
import { Settings } from './components/Settings'
import { SocialTab, type SocialLink } from './components/social/SocialTab'
import { inviteCodeFromInput, usernameFromInput } from './friends/api'
import { useSocial } from './friends/social'
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
const LINK_KEY = 'watchmatch:pendingLink'
/** An invite waits this long for the person to sign in and create a profile. */
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Invite (?convite=code) and profile (?amigo=username) links. The link is kept on the device
 * until it is used, because signing in through the e-mail link opens the app again without it.
 */
function readSocialLink(): SocialLink | null {
  const invite = params.get('convite')
  const profile = params.get('amigo')
  if (invite === null && profile === null) {
    try {
      const saved = JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null') as { link: SocialLink; at: number } | null
      return saved && Date.now() - saved.at < LINK_TTL_MS ? saved.link : null
    } catch {
      return null
    }
  }
  params.delete('convite')
  params.delete('amigo')
  const rest = params.toString()
  // Keep the hash: a sign-in link may carry the session there.
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
  const code = invite && inviteCodeFromInput(invite)
  const username = profile && usernameFromInput(profile)
  const link: SocialLink | null = code ? { kind: 'invite', code } : username ? { kind: 'profile', username } : null
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify({ link, at: Date.now() }))
  } catch {
    // Works for this visit anyway.
  }
  return link
}

function forgetSocialLink() {
  try {
    localStorage.removeItem(LINK_KEY)
  } catch {
    // Nothing saved.
  }
}

const openedWith = readSocialLink()

/** Home screen shortcuts open a tab directly (?tab=recs). */
function initialTab(): Tab {
  if (openedWith) return 'friends'
  const t = params.get('tab')
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'discover'
}

export function App() {
  const { ready, prefs, entries, error, cloud, rescaleNotice, dismissRescaleNotice } = useStore()
  const { badge } = useSocial()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [sheet, setSheet] = useState<'settings' | 'prefs' | 'guide' | 'ratingGuide' | 'search' | null>(null)
  const [guideDone, setGuideDone] = useState(guideSeen)
  const [link, setLink] = useState(openedWith)
  const clearLink = useCallback(() => {
    setLink(null)
    forgetSocialLink()
  }, [])
  const pending = useMemo(() => rateQueue(entries).length, [entries])
  const filters = prefs ? activeFilterCount(prefs) : 0
  const openPrefs = () => setSheet('prefs')

  if (ready && !prefs) return <Onboarding invited={link !== null} />

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

      {/* The scale changed and old ratings went back to the queue: ask for them again. */}
      {rescaleNotice && tab !== 'rate' && (
        <div className="banner rescale-banner" role="status">
          <span>
            As notas mudaram para 1 a 9, e o 9 é o favorito. Suas notas voltaram para a aba Avaliar: reavalie no sistema novo.
          </span>
          <button className="primary" onClick={() => setTab('rate')}>
            Reavaliar
          </button>
        </div>
      )}

      {error && <div className="toast">{error}</div>}
      {/* A failed magic link lands here signed out; surface it without opening settings. */}
      {cloud.status === 'signed-out' && cloud.message && <div className="toast">{cloud.message}</div>}

      <main>
        {tab === 'discover' && <DiscoverTab onOpenPrefs={openPrefs} />}
        {tab === 'rate' && <RateTab />}
        {tab === 'recs' && <RecsTab onOpenPrefs={openPrefs} />}
        {tab === 'lists' && <ListsTab />}
        {tab === 'friends' && <SocialTab link={link} onLinkHandled={clearLink} onOpenSettings={() => setSheet('settings')} />}
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
            {id === 'friends' && badge > 0 && <span className="tab-badge">{badge}</span>}
          </button>
        ))}
      </nav>

      {sheet === 'settings' && (
        <Settings
          onClose={() => setSheet(null)}
          onOpenPrefs={openPrefs}
          onOpenGuide={() => setSheet('guide')}
          onOpenRatingGuide={() => setSheet('ratingGuide')}
        />
      )}
      {sheet === 'prefs' && <PreferencesSheet onClose={() => setSheet(null)} />}
      {sheet === 'ratingGuide' && (
        <RatingGuide
          rescaled={rescaleNotice}
          onClose={() => {
            setSheet(null)
            dismissRescaleNotice()
          }}
        />
      )}
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
