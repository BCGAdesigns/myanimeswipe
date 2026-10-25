import type { Entry, Media } from '../types'

/** One row of `public.entries` (see supabase/migrations). */
export interface RemoteRow {
  user_id: string
  media_id: string
  status: Entry['status']
  rating: number | null
  suggested_rating: number | null
  queued_at: number | null
  skipped_at: number | null
  via: Entry['via']
  updated_at: number
  rev: number
  deleted: boolean
  media: Media | null
  /** Server cursor, set by the database on every accepted write. */
  synced_at?: string
}

/** A local change waiting to be pushed: the latest rev of a record or of its removal. */
export interface OutboxItem {
  mediaId: string
  rev: number
}

/** Remote change to apply locally; `entry: null` removes the record. */
export interface RemoteChange {
  mediaId: string
  rev: number
  entry: Entry | null
  media?: Media
}

export interface SyncMeta {
  userId: string
  /** `synced_at` of the newest pulled row, or null before the first pull. */
  cursor: string | null
}

/** Device storage the engine needs; IndexedDB in the app, memory in tests. */
export interface LocalStore {
  getOutbox(): Promise<OutboxItem[]>
  /** Drops pushed items unless they changed again while the push was in flight. */
  clearOutbox(pushed: OutboxItem[]): Promise<void>
  /** Queues every local record, for the first sync of an account on this device. */
  enqueueAll(): Promise<void>
  getEntry(mediaId: string): Promise<Entry | undefined>
  getMedia(mediaId: string): Promise<Media | undefined>
  /** Applies changes newer than local state and returns the ones applied. */
  applyRemote(changes: RemoteChange[]): Promise<RemoteChange[]>
  getSyncMeta(): Promise<SyncMeta | undefined>
  saveSyncMeta(meta: SyncMeta): Promise<void>
}

export interface RemoteApi {
  push(rows: RemoteRow[]): Promise<void>
  /** Rows with `synced_at` after `since` (all rows when null), oldest first. */
  pull(userId: string, since: string | null, limit: number): Promise<RemoteRow[]>
}

const PUSH_BATCH = 200
const PULL_PAGE = 500
/** Re-reads a few seconds before the cursor: writes committing out of order are not missed, and re-applying is a no-op. */
const PULL_OVERLAP_MS = 5000

export function revOf(entry: Entry): number {
  return entry.rev ?? entry.updatedAt
}

export function toRow(userId: string, item: OutboxItem, entry: Entry | undefined, media: Media | undefined): RemoteRow {
  if (!entry) {
    // Tombstone; the content columns are placeholders the clients ignore.
    return {
      user_id: userId,
      media_id: item.mediaId,
      status: 'skip',
      rating: null,
      suggested_rating: null,
      queued_at: null,
      skipped_at: null,
      via: 'discover',
      updated_at: item.rev,
      rev: item.rev,
      deleted: true,
      media: null,
    }
  }
  return {
    user_id: userId,
    media_id: entry.mediaId,
    status: entry.status,
    rating: entry.rating,
    suggested_rating: entry.suggestedRating,
    queued_at: entry.queuedAt ?? null,
    skipped_at: entry.skippedAt ?? null,
    via: entry.via,
    updated_at: entry.updatedAt,
    rev: revOf(entry),
    deleted: false,
    media: media ?? null,
  }
}

export function fromRow(row: RemoteRow): Entry {
  const entry: Entry = {
    mediaId: row.media_id,
    status: row.status,
    rating: row.rating,
    suggestedRating: row.suggested_rating,
    via: row.via,
    updatedAt: Number(row.updated_at),
    rev: Number(row.rev),
  }
  if (row.queued_at != null) entry.queuedAt = Number(row.queued_at)
  if (row.skipped_at != null) entry.skippedAt = Number(row.skipped_at)
  return entry
}

export function toChange(row: RemoteRow): RemoteChange {
  const rev = Number(row.rev)
  if (row.deleted) return { mediaId: row.media_id, rev, entry: null }
  return { mediaId: row.media_id, rev, entry: fromRow(row), media: row.media ?? undefined }
}

/** True when a remote change is newer than both the local record and any pending local change. */
export function isNewer(remoteRev: number, local: Entry | undefined, pendingRev: number | undefined): boolean {
  const localRev = Math.max(local ? revOf(local) : -1, pendingRev ?? -1)
  return remoteRev > localRev
}

export interface SyncResult {
  pushed: number
  applied: RemoteChange[]
}

/** Pushes local changes, then pulls everything newer than the cursor. */
export async function runSync(store: LocalStore, remote: RemoteApi, userId: string): Promise<SyncResult> {
  let meta = await store.getSyncMeta()
  if (!meta || meta.userId !== userId) {
    await store.enqueueAll()
    meta = { userId, cursor: null }
  }

  const outbox = await store.getOutbox()
  for (let i = 0; i < outbox.length; i += PUSH_BATCH) {
    const batch = outbox.slice(i, i + PUSH_BATCH)
    const rows = await Promise.all(
      batch.map(async (item) => {
        const entry = await store.getEntry(item.mediaId)
        return toRow(userId, item, entry, entry ? await store.getMedia(item.mediaId) : undefined)
      }),
    )
    await remote.push(rows)
    await store.clearOutbox(batch)
  }

  const applied: RemoteChange[] = []
  let cursor = meta.cursor
  let since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null
  for (;;) {
    const rows = await remote.pull(userId, since, PULL_PAGE)
    if (rows.length === 0) break
    applied.push(...(await store.applyRemote(rows.map(toChange))))
    const last = rows[rows.length - 1].synced_at ?? null
    if (last && (!cursor || Date.parse(last) >= Date.parse(cursor))) cursor = last
    if (rows.length < PULL_PAGE || !last) break
    since = last
  }
  await store.saveSyncMeta({ userId, cursor })

  return { pushed: outbox.length, applied }
}
