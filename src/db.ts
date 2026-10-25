import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { isNewer, revOf, type LocalStore, type OutboxItem, type RemoteChange, type SyncMeta } from './sync/engine'
import type { Entry, Media } from './types'

export interface CatalogMeta {
  /** Media ids in catalog (popularity) order. */
  order: string[]
  nextPage: number
  hasNextPage: boolean
}

interface SwipeDB extends DBSchema {
  media: { key: string; value: Media }
  entries: { key: string; value: Entry }
  meta: { key: string; value: CatalogMeta | SyncMeta }
  /** Local changes not yet pushed to the cloud, one per media (latest wins). */
  outbox: { key: string; value: OutboxItem }
}

let dbPromise: Promise<IDBPDatabase<SwipeDB>> | null = null

function db() {
  dbPromise ??= openDB<SwipeDB>('myanimeswipe', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('media', { keyPath: 'id' })
        d.createObjectStore('entries', { keyPath: 'mediaId' })
        d.createObjectStore('meta')
      }
      if (oldVersion < 2) d.createObjectStore('outbox', { keyPath: 'mediaId' })
    },
  })
  return dbPromise
}

export async function loadAll() {
  const d = await db()
  const [media, entries, catalog] = await Promise.all([
    d.getAll('media'),
    d.getAll('entries'),
    d.get('meta', 'catalog') as Promise<CatalogMeta | undefined>,
  ])
  return { media, entries, catalog: catalog ?? { order: [], nextPage: 1, hasNextPage: true } }
}

export async function saveMedia(items: Media[]) {
  const tx = (await db()).transaction('media', 'readwrite')
  await Promise.all([...items.map((m) => tx.store.put(m)), tx.done])
}

export async function saveCatalog(meta: CatalogMeta) {
  await (await db()).put('meta', meta, 'catalog')
}

/** Saves records changed on this device and queues them for the cloud. */
export async function saveLocalEntries(entries: Entry[]) {
  const tx = (await db()).transaction(['entries', 'outbox'], 'readwrite')
  await Promise.all([
    ...entries.flatMap((e) => [
      tx.objectStore('entries').put(e),
      tx.objectStore('outbox').put({ mediaId: e.mediaId, rev: revOf(e) }),
    ]),
    tx.done,
  ])
}

/** Removes a record on this device and queues the removal for the cloud. */
export async function removeLocalEntry(mediaId: string, rev: number) {
  const tx = (await db()).transaction(['entries', 'outbox'], 'readwrite')
  await Promise.all([
    tx.objectStore('entries').delete(mediaId),
    tx.objectStore('outbox').put({ mediaId, rev }),
    tx.done,
  ])
}

export async function countOutbox() {
  return (await db()).count('outbox')
}

export async function clearAll() {
  const d = await db()
  await Promise.all([d.clear('media'), d.clear('entries'), d.clear('meta'), d.clear('outbox')])
}

export const idbStore: LocalStore = {
  async getOutbox() {
    return (await db()).getAll('outbox')
  },

  async clearOutbox(pushed) {
    const tx = (await db()).transaction('outbox', 'readwrite')
    for (const item of pushed) {
      const current = await tx.store.get(item.mediaId)
      if (current && current.rev <= item.rev) await tx.store.delete(item.mediaId)
    }
    await tx.done
  },

  async enqueueAll() {
    const tx = (await db()).transaction(['entries', 'outbox'], 'readwrite')
    const outbox = tx.objectStore('outbox')
    for (const entry of await tx.objectStore('entries').getAll()) {
      const queued = await outbox.get(entry.mediaId)
      if (!queued || queued.rev < revOf(entry)) await outbox.put({ mediaId: entry.mediaId, rev: revOf(entry) })
    }
    await tx.done
  },

  async getEntry(mediaId) {
    return (await db()).get('entries', mediaId)
  },

  async getMedia(mediaId) {
    return (await db()).get('media', mediaId)
  },

  async applyRemote(changes: RemoteChange[]) {
    const tx = (await db()).transaction(['entries', 'outbox', 'media'], 'readwrite')
    const entries = tx.objectStore('entries')
    const media = tx.objectStore('media')
    const applied: RemoteChange[] = []
    for (const change of changes) {
      const local = await entries.get(change.mediaId)
      const pending = await tx.objectStore('outbox').get(change.mediaId)
      if (!isNewer(change.rev, local, pending?.rev)) continue
      if (change.entry) await entries.put(change.entry)
      else if (local) await entries.delete(change.mediaId)
      // Keep the catalog's copy when there is one; the snapshot only fills gaps.
      if (change.media && !(await media.get(change.media.id))) await media.put(change.media)
      applied.push(change)
    }
    await tx.done
    return applied
  },

  async getSyncMeta() {
    return (await (await db()).get('meta', 'sync')) as SyncMeta | undefined
  },

  async saveSyncMeta(meta: SyncMeta) {
    await (await db()).put('meta', meta, 'sync')
  },
}
