// Social layer client: profile card (`public.usernames`), friendships, feed, likes,
// recommendations and taste tests. Everything about other people goes through the RPCs in
// supabase/migrations/20261025150000_usernames_and_friendships.sql and 20261025170000_social.sql.
import { getClient } from '../sync/client'
import type { EntryStatus, Media } from '../types'
import { mediaSnapshot, parseSharedList, type SharedEntry } from './compare'
import { parseAnswers, parseItems, type Answers, type TestItem } from './taste'

export const USERNAME_RULE = /^[a-z0-9_.]{3,20}$/
const CODE_RULE = /^[a-z0-9]{10}$/

/** "@Ana.Clara " becomes "ana.clara". */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase()
}

/** A first suggestion for the username, from the part of the e-mail before the @. */
export function suggestUsername(email: string | null): string {
  const base = (email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)
  return base.length >= 3 ? base : ''
}

function fromLink(input: string, param: string): string | null {
  try {
    return new URL(input.trim()).searchParams.get(param)
  } catch {
    return null
  }
}

/** Accepts @name, a bare name or a pasted profile link (?amigo=name). */
export function usernameFromInput(input: string): string | null {
  const name = normalizeUsername(fromLink(input, 'amigo') ?? input)
  return USERNAME_RULE.test(name) ? name : null
}

/** Accepts a typed invite code (spaces allowed) or a pasted invite link (?convite=code). */
export function inviteCodeFromInput(input: string): string | null {
  const link = fromLink(input, 'convite')
  if (link === null && /^\s*@/.test(input)) return null
  const code = (link ?? input).toLowerCase().replace(/[^a-z0-9]/g, '')
  return CODE_RULE.test(code) ? code : null
}

const appUrl = () => `${window.location.origin}${window.location.pathname}`
export const inviteLink = (code: string) => `${appUrl()}?convite=${code}`
export const profileLink = (username: string) => `${appUrl()}?amigo=${username}`
export const spacedCode = (code: string) => `${code.slice(0, 5)} ${code.slice(5)}`

export interface Person {
  userId: string
  username: string
  displayName: string | null
  avatar: string | null
}

export interface MyProfile {
  username: string
  displayName: string | null
  avatar: string | null
  bio: string | null
  inviteCode: string | null
}

export type FriendState = 'friend' | 'incoming' | 'outgoing'

export interface FriendRow extends Person {
  bio: string | null
  state: FriendState
  since: string
}

export interface FriendProfile extends Person {
  bio: string | null
  entries: SharedEntry[]
}

export interface FeedItem extends Person {
  mediaId: string
  status: EntryStatus
  rating: number | null
  suggestedRating: number | null
  favorite: boolean
  updatedAt: number
  media: Media | null
  likes: number
  liked: boolean
}

export interface LikeReceived extends Person {
  mediaId: string
  media: Media | null
  createdAt: string
}

/** A friend's record of one title (title sheet). */
export interface FriendTake extends Person {
  status: EntryStatus
  rating: number | null
  suggestedRating: number | null
  favorite: boolean
  updatedAt: number
}

interface RecBase extends Person {
  id: string
  mediaId: string
  media: Media
  note: string | null
  createdAt: string
  seenAt: string | null
  likedAt: string | null
}

export type ReceivedRec = RecBase

export interface SentRec extends RecBase {
  dismissed: boolean
  theirStatus: EntryStatus | null
  theirRating: number | null
  theirFavorite: boolean | null
}

export interface TasteTest extends Person {
  id: string
  createdByMe: boolean
  items: TestItem[]
  myAnswers: Answers | null
  theirAnswers: Answers | null
  myDone: boolean
  theirDone: boolean
  createdAt: string
}

/** Server messages the screens can explain. */
function friendlyError(message: string): string {
  if (/usernames_username_key/i.test(message)) return 'Esse nome de usuário já está em uso. Tente outro.'
  if (/duplicate key/i.test(message)) return 'Não deu certo desta vez. Tente de novo.'
  if (/choose a username first/i.test(message)) return 'Crie seu perfil antes.'
  if (/unknown invite/i.test(message)) return 'Código de convite inválido. Confira com quem te mandou.'
  if (/own invite/i.test(message)) return 'Esse é o seu próprio código.'
  if (/not friends/i.test(message)) return 'Vocês precisam ser amigos para isso.'
  if (/unknown or answered test/i.test(message)) return 'Esse teste já foi respondido.'
  if (/unknown user|invalid friend/i.test(message)) return 'Pessoa não encontrada.'
  if (/sign in first|JWT/i.test(message)) return 'Entre na sua conta primeiro.'
  if (/failed to fetch|network|load failed/i.test(message)) return 'Sem conexão. Tente de novo.'
  return message
}

async function client() {
  const c = await getClient()
  if (!c) throw new Error('Esta versão do app não tem conexão com o servidor.')
  return c
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (await client()).rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

type PersonRow = { user_id: string; username: string; display_name: string | null; avatar?: string | null }
const toPerson = (r: PersonRow): Person => ({
  userId: r.user_id,
  username: r.username,
  displayName: r.display_name,
  avatar: r.avatar ?? null,
})

/** Snapshots from the server lack tags (and maybe genres); the cards expect both. */
const cardMedia = (m: Media) => ({ ...m, tags: [], genres: m.genres ?? [] })

export async function getMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await (await client())
    .from('usernames')
    .select('username, display_name, avatar, bio, invite_code')
    .maybeSingle()
  if (error) throw new Error(friendlyError(error.message))
  return (
    data && {
      username: data.username,
      displayName: data.display_name,
      avatar: data.avatar,
      bio: data.bio,
      inviteCode: data.invite_code,
    }
  )
}

/** Creates or updates the caller's card; the server picks the invite code. */
export async function saveMyProfile(p: Omit<MyProfile, 'inviteCode'>): Promise<MyProfile> {
  const { data, error } = await (await client())
    .from('usernames')
    .upsert({ username: p.username, display_name: p.displayName, avatar: p.avatar, bio: p.bio }, { onConflict: 'user_id' })
    .select('username, display_name, avatar, bio, invite_code')
    .single()
  if (error) throw new Error(friendlyError(error.message))
  return {
    username: data.username,
    displayName: data.display_name,
    avatar: data.avatar,
    bio: data.bio,
    inviteCode: data.invite_code,
  }
}

export const regenerateInvite = () => rpc<string>('regenerate_invite_code')

export async function addByInvite(code: string): Promise<Person | null> {
  const rows = await rpc<PersonRow[]>('add_by_invite', { code })
  return rows?.[0] ? toPerson(rows[0]) : null
}

/** People whose username starts with the text (3 characters or more). */
export async function findPeople(query: string): Promise<Person[]> {
  return ((await rpc<PersonRow[]>('people_search', { query })) ?? []).map(toPerson)
}

/** Sends a request, or becomes friends right away when they had already asked. */
export const requestFriend = (userId: string) => rpc<'requested' | 'friends'>('request_friend', { target: userId })
export const respondFriend = (userId: string, accept: boolean) =>
  rpc<void>('respond_friend', { requester_id: userId, accept })
/** Ends a friendship or cancels a request. */
export const removeFriend = (userId: string) => rpc<void>('remove_friend', { other: userId })

export async function friendsOverview(): Promise<FriendRow[]> {
  const rows = await rpc<(PersonRow & { bio: string | null; state: FriendState; since: string })[]>('friends_overview')
  return (rows ?? []).map((r) => ({ ...toPerson(r), bio: r.bio, state: r.state, since: r.since }))
}

/** A friend's card and whole list, or null when the friendship ended. */
export async function fetchFriendProfile(userId: string): Promise<FriendProfile | null> {
  const raw = await rpc<Record<string, unknown> | null>('friend_profile', { friend: userId })
  if (!raw) return null
  return {
    userId,
    username: String(raw.username ?? ''),
    displayName: (raw.displayName as string | null) ?? null,
    avatar: (raw.avatar as string | null) ?? null,
    bio: (raw.bio as string | null) ?? null,
    entries: parseSharedList(raw)?.entries ?? [],
  }
}

/** What friends did with one title. */
export async function friendsOnTitle(mediaId: string): Promise<FriendTake[]> {
  return (await rpc<FriendTake[]>('friends_on_title', { media_key: mediaId })) ?? []
}

export const toggleLike = (userId: string, mediaId: string) => rpc<boolean>('toggle_like', { target: userId, media: mediaId })

/** Friends' activity, newest first; pass the oldest time already shown to page back. */
export async function fetchFeed(beforeMs?: number): Promise<FeedItem[]> {
  const items = await rpc<FeedItem[]>('friends_feed', { before_ms: beforeMs ?? null, max_items: FEED_PAGE })
  return (items ?? []).map((i) => ({ ...i, media: i.media ? cardMedia(i.media) : null }))
}
export const FEED_PAGE = 40

export async function likesReceived(): Promise<LikeReceived[]> {
  const items = await rpc<LikeReceived[]>('likes_received', { max_items: 30 })
  return (items ?? []).map((i) => ({ ...i, media: i.media ? cardMedia(i.media) : null }))
}

export const recommend = (userId: string, m: Media, note: string | null) =>
  rpc<string>('recommend', { to_friend: userId, media_key: m.id, media_snapshot: mediaSnapshot(m), note_text: note })

export const updateRecommendation = (id: string, change: { seen?: boolean; liked?: boolean; dismiss?: boolean }) =>
  rpc<void>('update_recommendation', {
    rec: id,
    mark_seen: change.seen ?? false,
    liked: change.liked ?? null,
    dismiss: change.dismiss ?? false,
  })

export const unsendRecommendation = (id: string) => rpc<void>('unsend_recommendation', { rec: id })

const withMedia = <T extends { media: Media }>(list: T[] | null) => (list ?? []).map((r) => ({ ...r, media: cardMedia(r.media) }))

export const receivedRecommendations = async () => withMedia(await rpc<ReceivedRec[]>('received_recommendations'))
export const sentRecommendations = async () => withMedia(await rpc<SentRec[]>('sent_recommendations'))

export const createTasteTest = (userId: string, items: TestItem[]) =>
  rpc<string>('create_taste_test', { friend: userId, test_items: items })
export const answerTasteTest = (id: string, answers: Answers) => rpc<void>('answer_taste_test', { test: id, answers })
export const deleteTasteTest = (id: string) => rpc<void>('delete_taste_test', { test: id })

export async function myTasteTests(): Promise<TasteTest[]> {
  const raw = (await rpc<Record<string, unknown>[]>('my_taste_tests')) ?? []
  return raw.map((t) => ({
    ...(t as unknown as TasteTest),
    items: parseItems(t.items),
    myAnswers: parseAnswers(t.myAnswers),
    theirAnswers: parseAnswers(t.theirAnswers),
  }))
}
