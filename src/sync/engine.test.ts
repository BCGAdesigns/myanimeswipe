import { describe, expect, it } from 'vitest'
import { applyAction } from '../logic'
import type { Entry, Media } from '../types'
import {
  isNewer,
  revOf,
  runSync,
  toChange,
  toRow,
  type LocalStore,
  type OutboxItem,
  type RemoteApi,
  type RemoteChange,
  type RemoteRow,
  type SyncMeta,
} from './engine'

const USER = 'user-1'

/** In-memory twin of the IndexedDB store, with the same rules. */
class Device implements LocalStore {
  entries = new Map<string, Entry>()
  media = new Map<string, Media>()
  outbox = new Map<string, number>()
  meta: SyncMeta | undefined

  // Same bookkeeping as db.saveLocalEntries / db.removeLocalEntry.
  write(entry: Entry) {
    this.entries.set(entry.mediaId, entry)
    this.outbox.set(entry.mediaId, revOf(entry))
  }
  remove(mediaId: string, rev: number) {
    this.entries.delete(mediaId)
    this.outbox.set(mediaId, rev)
  }

  async getOutbox() {
    return [...this.outbox].map(([mediaId, rev]) => ({ mediaId, rev }))
  }
  async clearOutbox(pushed: OutboxItem[]) {
    for (const item of pushed) if ((this.outbox.get(item.mediaId) ?? Infinity) <= item.rev) this.outbox.delete(item.mediaId)
  }
  async enqueueAll() {
    for (const e of this.entries.values()) {
      if ((this.outbox.get(e.mediaId) ?? -1) < revOf(e)) this.outbox.set(e.mediaId, revOf(e))
    }
  }
  async getEntry(id: string) {
    return this.entries.get(id)
  }
  async getMedia(id: string) {
    return this.media.get(id)
  }
  async applyRemote(changes: RemoteChange[]) {
    const applied = []
    for (const c of changes) {
      if (!isNewer(c.rev, this.entries.get(c.mediaId), this.outbox.get(c.mediaId))) continue
      if (c.entry) this.entries.set(c.mediaId, c.entry)
      else this.entries.delete(c.mediaId)
      if (c.media && !this.media.has(c.media.id)) this.media.set(c.media.id, c.media)
      applied.push(c)
    }
    return applied
  }
  async getSyncMeta() {
    return this.meta
  }
  async saveSyncMeta(meta: SyncMeta) {
    this.meta = meta
  }
}

/** Mirrors the SQL trigger: stale revs are dropped, accepted writes get a fresh synced_at. */
class Server implements RemoteApi {
  rows = new Map<string, RemoteRow>()
  pushes = 0
  private tick = 0

  async push(rows: RemoteRow[]) {
    this.pushes++
    for (const row of rows) {
      const key = `${row.user_id}|${row.media_id}`
      const current = this.rows.get(key)
      if (current && row.rev < current.rev) continue
      this.tick++
      this.rows.set(key, { ...row, synced_at: new Date(Date.UTC(2026, 9, 25) + this.tick).toISOString() })
    }
  }

  async pull(userId: string, since: string | null, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.user_id === userId && (!since || r.synced_at! > since))
      .sort((a, b) => a.synced_at!.localeCompare(b.synced_at!))
      .slice(0, limit)
  }
}

const media = (id: string): Media => ({
  id,
  source: 'anilist',
  sourceId: Number(id.split(':')[1]),
  kind: 'anime',
  title: `Anime ${id}`,
  cover: 'x.jpg',
  genres: [],
  tags: [],
  links: {},
})

const entry = (id: string, action: Parameters<typeof applyAction>[1], rev: number): Entry => ({
  ...applyAction(id, action, 'discover', rev),
  rev,
})

describe('toRow / toChange', () => {
  it('round-trips an entry with its media snapshot', () => {
    const e = { ...entry('anilist:1', 'liked', 100), rating: 9 }
    const row = toRow(USER, { mediaId: e.mediaId, rev: 100 }, e, media('anilist:1'))
    expect(row).toMatchObject({ user_id: USER, rev: 100, deleted: false, suggested_rating: 8, rating: 9 })
    expect(toChange(row)).toEqual({ mediaId: 'anilist:1', rev: 100, entry: e, media: media('anilist:1') })
  })

  it('turns a missing entry into a tombstone', () => {
    const row = toRow(USER, { mediaId: 'anilist:2', rev: 50 }, undefined, undefined)
    expect(row).toMatchObject({ deleted: true, rev: 50, media: null })
    expect(toChange(row)).toEqual({ mediaId: 'anilist:2', rev: 50, entry: null })
  })

  it('treats records from before sync as rev = updatedAt', () => {
    const legacy: Entry = { ...applyAction('anilist:3', 'want', 'discover', 7) }
    expect(revOf(legacy)).toBe(7)
  })
})

describe('runSync', () => {
  it('uploads existing local data on the first sync of an account', async () => {
    const server = new Server()
    const phone = new Device()
    phone.entries.set('anilist:1', applyAction('anilist:1', 'want', 'discover', 10))
    phone.media.set('anilist:1', media('anilist:1'))

    const result = await runSync(phone, server, USER)

    expect(result.pushed).toBe(1)
    expect(server.rows.get(`${USER}|anilist:1`)).toMatchObject({ status: 'want', rev: 10, media: { title: 'Anime anilist:1' } })
    expect(phone.outbox.size).toBe(0)
    expect(phone.meta?.cursor).toBeTruthy()
  })

  it('brings a new device up to date, media included', async () => {
    const server = new Server()
    const phone = new Device()
    phone.write(entry('anilist:1', 'liked', 100))
    phone.media.set('anilist:1', media('anilist:1'))
    await runSync(phone, server, USER)

    const pc = new Device()
    const { applied } = await runSync(pc, server, USER)

    expect(applied.map((c) => c.mediaId)).toEqual(['anilist:1'])
    expect(pc.entries.get('anilist:1')).toMatchObject({ status: 'seen', suggestedRating: 8, rev: 100 })
    expect(pc.media.get('anilist:1')?.title).toBe('Anime anilist:1')
  })

  it('keeps the newest change when two devices edit the same anime', async () => {
    const server = new Server()
    const phone = new Device()
    const pc = new Device()
    await runSync(phone, server, USER)
    await runSync(pc, server, USER)

    phone.write(entry('anilist:1', 'want', 200))
    pc.write(entry('anilist:1', 'reject', 100)) // older, made offline
    await runSync(phone, server, USER)
    await runSync(pc, server, USER)
    await runSync(phone, server, USER)

    expect(server.rows.get(`${USER}|anilist:1`)?.status).toBe('want')
    expect(pc.entries.get('anilist:1')?.status).toBe('want')
    expect(phone.entries.get('anilist:1')?.status).toBe('want')
  })

  it('propagates removals as tombstones', async () => {
    const server = new Server()
    const phone = new Device()
    const pc = new Device()
    phone.write(entry('anilist:1', 'want', 100))
    await runSync(phone, server, USER)
    await runSync(pc, server, USER)
    expect(pc.entries.has('anilist:1')).toBe(true)

    phone.remove('anilist:1', 150)
    await runSync(phone, server, USER)
    await runSync(pc, server, USER)

    expect(server.rows.get(`${USER}|anilist:1`)?.deleted).toBe(true)
    expect(pc.entries.has('anilist:1')).toBe(false)
  })

  it('never lets a pull overwrite a newer change still waiting to be pushed', async () => {
    const phone = new Device()
    phone.write(entry('anilist:1', 'want', 300))
    phone.meta = { userId: USER, cursor: null }
    const applied = await phone.applyRemote([toChange(toRow(USER, { mediaId: 'anilist:1', rev: 200 }, entry('anilist:1', 'reject', 200), undefined))])
    expect(applied).toEqual([])
    expect(phone.entries.get('anilist:1')?.status).toBe('want')
  })

  it('keeps a change made while a push is in flight', async () => {
    const phone = new Device()
    phone.write(entry('anilist:1', 'want', 100))
    const pushed = await phone.getOutbox()
    phone.write(entry('anilist:1', 'reject', 200))
    await phone.clearOutbox(pushed)
    expect(phone.outbox.get('anilist:1')).toBe(200)
  })

  it('pages through large pulls and pushes in batches', async () => {
    const server = new Server()
    const phone = new Device()
    for (let i = 0; i < 1200; i++) phone.write(entry(`anilist:${i}`, 'skip', 1000 + i))
    await runSync(phone, server, USER)
    expect(server.pushes).toBe(6)

    const pc = new Device()
    const { applied } = await runSync(pc, server, USER)
    expect(applied).toHaveLength(1200)
    expect(pc.entries.size).toBe(1200)
  })

  it('pulls only what changed since the last sync', async () => {
    const server = new Server()
    const phone = new Device()
    const pc = new Device()
    phone.write(entry('anilist:1', 'want', 100))
    await runSync(phone, server, USER)
    await runSync(pc, server, USER)

    const again = await runSync(pc, server, USER)
    expect(again.applied).toEqual([])

    phone.write(entry('anilist:2', 'seen', 200))
    await runSync(phone, server, USER)
    const next = await runSync(pc, server, USER)
    expect(next.applied.map((c) => c.mediaId)).toEqual(['anilist:2'])
  })
})
