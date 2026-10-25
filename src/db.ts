import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
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
  meta: { key: string; value: CatalogMeta }
}

let dbPromise: Promise<IDBPDatabase<SwipeDB>> | null = null

function db() {
  dbPromise ??= openDB<SwipeDB>('myanimeswipe', 1, {
    upgrade(d) {
      d.createObjectStore('media', { keyPath: 'id' })
      d.createObjectStore('entries', { keyPath: 'mediaId' })
      d.createObjectStore('meta')
    },
  })
  return dbPromise
}

export async function loadAll() {
  const d = await db()
  const [media, entries, catalog] = await Promise.all([
    d.getAll('media'),
    d.getAll('entries'),
    d.get('meta', 'catalog'),
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

export async function putEntry(entry: Entry) {
  await (await db()).put('entries', entry)
}

export async function deleteEntry(mediaId: string) {
  await (await db()).delete('entries', mediaId)
}

export async function putEntries(entries: Entry[]) {
  const tx = (await db()).transaction('entries', 'readwrite')
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done])
}

export async function clearAll() {
  const d = await db()
  await Promise.all([d.clear('media'), d.clear('entries'), d.clear('meta')])
}
