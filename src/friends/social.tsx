// Shared social state: the user's card, friends and requests, recommendations, taste tests and
// likes, refreshed when the app comes back to the foreground. Screens and badges read it here.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import {
  fetchFriendProfile,
  friendsOverview,
  getMyProfile,
  likesReceived,
  myTasteTests,
  receivedRecommendations,
  sentRecommendations,
  type FriendProfile,
  type FriendRow,
  type LikeReceived,
  type MyProfile,
  type ReceivedRec,
  type SentRec,
  type TasteTest,
} from './api'

interface Counts {
  requests: number
  recs: number
  tests: number
  likes: number
}

interface Social {
  /** Signed in on a build that talks to the server. */
  available: boolean
  /** Undefined while loading, null before the user creates a card. */
  me: MyProfile | null | undefined
  /** The first load of friends, recommendations and tests finished. */
  loaded: boolean
  setMe: (p: MyProfile) => void
  rows: FriendRow[]
  friends: FriendRow[]
  received: ReceivedRec[]
  sent: SentRec[]
  tests: TasteTest[]
  likes: LikeReceived[]
  counts: Counts
  /** Everything waiting for the user, for the tab badge. */
  badge: number
  error: string | null
  refresh: () => Promise<void>
  /** A friend's card and list, cached for a few minutes. */
  friendList: (userId: string, force?: boolean) => Promise<FriendProfile | null>
  /** Last compatibility seen for each friend, shown in the friends list. */
  compat: Record<string, number | null>
  rememberCompat: (userId: string, value: number | null) => void
  likesSeenAt: number
  markLikesSeen: () => void
}

const Ctx = createContext<Social | null>(null)

export function useSocial() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSocial outside SocialProvider')
  return s
}

const LIKES_KEY = 'watchmatch:likesSeenAt'
const COMPAT_KEY = 'watchmatch:compat'
const LIST_TTL_MS = 3 * 60 * 1000
/** Keeps badges fresh while the app stays open, without hammering the server. */
const POLL_MS = 90 * 1000
const MIN_REFRESH_GAP_MS = 15 * 1000

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Only a convenience.
  }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function SocialProvider({ children }: { children: ReactNode }) {
  const { cloud } = useStore()
  const available = cloud.status !== 'off' && Boolean(cloud.email)
  const [me, setMeState] = useState<MyProfile | null | undefined>(undefined)
  const [rows, setRows] = useState<FriendRow[]>([])
  const [received, setReceived] = useState<ReceivedRec[]>([])
  const [sent, setSent] = useState<SentRec[]>([])
  const [tests, setTests] = useState<TasteTest[]>([])
  const [likes, setLikes] = useState<LikeReceived[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [compat, setCompat] = useState<Record<string, number | null>>(() => readJson(COMPAT_KEY, {}))
  const [likesSeenAt, setLikesSeenAt] = useState(() => readJson<number>(LIKES_KEY, 0))
  const lists = useRef(new Map<string, { at: number; profile: FriendProfile | null }>())
  const lastRefresh = useRef(0)
  const hasCard = useRef(false)

  const refresh = useCallback(async () => {
    if (!hasCard.current) return
    lastRefresh.current = Date.now()
    const [f, r, s, t, l] = await Promise.allSettled([
      friendsOverview(),
      receivedRecommendations(),
      sentRecommendations(),
      myTasteTests(),
      likesReceived(),
    ])
    if (f.status === 'fulfilled') setRows(f.value)
    if (r.status === 'fulfilled') setReceived(r.value)
    if (s.status === 'fulfilled') setSent(s.value)
    if (t.status === 'fulfilled') setTests(t.value)
    if (l.status === 'fulfilled') setLikes(l.value)
    const failed = [f, r, s, t, l].find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined
    setError(failed ? errorText(failed.reason) : null)
    setLoaded(true)
  }, [])

  const setMe = useCallback(
    (p: MyProfile) => {
      const first = !hasCard.current
      hasCard.current = true
      setMeState(p)
      if (first) void refresh()
    },
    [refresh],
  )

  useEffect(() => {
    if (!available) {
      hasCard.current = false
      lists.current.clear()
      setMeState(undefined)
      setRows([])
      setReceived([])
      setSent([])
      setTests([])
      setLikes([])
      setError(null)
      setLoaded(false)
      return
    }
    let cancelled = false
    getMyProfile()
      .then((p) => {
        if (cancelled) return
        hasCard.current = Boolean(p)
        setMeState(p)
        if (p) void refresh()
      })
      .catch((e) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [available, refresh])

  useEffect(() => {
    if (!available) return
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > MIN_REFRESH_GAP_MS) void refresh()
    }
    const timer = window.setInterval(wake, POLL_MS)
    document.addEventListener('visibilitychange', wake)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [available, refresh])

  const friendList = useCallback(async (userId: string, force = false) => {
    const cached = lists.current.get(userId)
    if (!force && cached && Date.now() - cached.at < LIST_TTL_MS) return cached.profile
    const profile = await fetchFriendProfile(userId)
    lists.current.set(userId, { at: Date.now(), profile })
    return profile
  }, [])

  const rememberCompat = useCallback((userId: string, value: number | null) => {
    setCompat((c) => {
      if (c[userId] === value) return c
      const next = { ...c, [userId]: value }
      writeJson(COMPAT_KEY, next)
      return next
    })
  }, [])

  const markLikesSeen = useCallback(() => {
    const latest = likes.reduce((max, l) => Math.max(max, Date.parse(l.createdAt) || 0), 0)
    if (latest <= likesSeenAt) return
    setLikesSeenAt(latest)
    writeJson(LIKES_KEY, latest)
  }, [likes, likesSeenAt])

  const value = useMemo<Social>(() => {
    const friends = rows.filter((r) => r.state === 'friend')
    const counts = {
      requests: rows.filter((r) => r.state === 'incoming').length,
      recs: received.filter((r) => !r.seenAt).length,
      tests: tests.filter((t) => !t.myDone).length,
      likes: likes.filter((l) => (Date.parse(l.createdAt) || 0) > likesSeenAt).length,
    }
    return {
      available,
      me,
      loaded,
      setMe,
      rows,
      friends,
      received,
      sent,
      tests,
      likes,
      counts,
      badge: counts.requests + counts.recs + counts.tests + counts.likes,
      error,
      refresh,
      friendList,
      compat,
      rememberCompat,
      likesSeenAt,
      markLikesSeen,
    }
  }, [available, me, loaded, setMe, rows, received, sent, tests, likes, error, refresh, friendList, compat, rememberCompat, likesSeenAt, markLikesSeen])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
