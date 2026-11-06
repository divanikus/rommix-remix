import assert from 'node:assert/strict'
import { test, afterEach } from 'node:test'
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InstalledRom, RommRom } from '@shared/types'
import type { RommClient } from './romm/index.ts'
import { Store } from './store.ts'
import { EsdeEnrichment, esdeFields, esdeArtwork, type EsdeStatus } from './esde.ts'

const roots: string[] = []
const workers: EsdeEnrichment[] = []
const originalRoot = process.env.ROMMIX_HOME
afterEach(() => {
  workers.splice(0).forEach((worker) => worker.stop())
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
  if (originalRoot === undefined) delete process.env.ROMMIX_HOME
  else process.env.ROMMIX_HOME = originalRoot
})
const rom = {
  id: 8,
  name: 'Server title',
  summary: 'Description',
  path_cover_large: null,
  path_cover_small: null,
  merged_screenshots: [],
  metadatum: {
    genres: ['Action'],
    developers: ['Developer'],
    publishers: ['Publisher'],
    player_count: '1-2',
    first_release_date: '1997-03-21',
    average_rating: 82
  },
  rom_user: { rating: 1, status: 'finished', last_played: 'today' }
} as unknown as RommRom
const entry = {
  romId: 8,
  system: 'psx',
  emulatorId: 'emudeck',
  launchPath: '/verified/roms/psx/Game.cue',
  path: '/verified/roms/psx/Game.cue',
  installedAt: '2026-11-07T00:00:00Z'
} as InstalledRom

function fixture(client = {} as RommClient) {
  const root = mkdtempSync(join(tmpdir(), 'rommix-esde-'))
  roots.push(root)
  process.env.ROMMIX_HOME = root
  const store = new Store(join(root, 'config'))
  store.setServer({ baseUrl: 'https://server.example', authMode: 'device' })
  store.addInstalled(entry)
  let result: EsdeStatus = { state: 'deferred', reason: 'ES-DE running' }
  let called = 0
  const published: Buffer[] = []
  const worker = new EsdeEnrichment(store, client, async (_action, job) => {
    called++
    for (const media of job?.media ?? []) published.push(readFileSync(media.source))
    return result
  })
  workers.push(worker)
  return {
    root,
    store,
    worker,
    published,
    called: () => called,
    answer: (next: EsdeStatus) => {
      result = next
    }
  }
}
async function quiet(): Promise<void> {
  await new Promise((r) => setTimeout(r, 30))
}
async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, 'Worker did not settle')
    await quiet()
  }
}

test('metadata excludes user curation, normalizes date and score', () => {
  assert.deepEqual(esdeFields(rom), {
    name: 'Server title',
    desc: 'Description',
    genre: 'Action',
    developer: 'Developer',
    publisher: 'Publisher',
    players: '1-2',
    rating: '0.82',
    releasedate: '19970321T000000'
  })
})
test('server media maps to ES-DE slots without external fetches or invented artwork', () => {
  const game = {
    ...rom,
    path_video: 'roms/1/video.mp4',
    path_manual: '/assets/romm/resources/roms/1/manual.pdf',
    ss_metadata: {
      fanart_path: 'roms/1/fanart.png',
      logo_path: 'roms/1/logo.png',
      title_screen_path: 'roms/1/title.png',
      box2d_back_path: 'roms/1/back.png'
    }
  }
  assert.deepEqual(
    esdeArtwork(game).map((a) => a.kind),
    ['videos', 'manuals', 'fanart', 'marquees', 'backcovers', 'titlescreens']
  )
  assert.equal(esdeArtwork({ ...rom, path_video: 'https://external.example/video.mp4' }).length, 0)
  assert.equal(
    esdeArtwork({ ...rom, path_video: '/assets/romm/resources/%2e%2e/private' }).length,
    0
  )
})
test('enrichment defaults off and does not queue or probe existing games', async () => {
  const f = fixture()
  assert.equal(f.store.settings.enrichEsde, false)
  await f.worker.completed(rom, entry)
  assert.equal(f.called(), 0)
  assert.equal(existsSync(join(f.root, 'config/esde-pending')), false)
})

test('a timestamped server cover is fetched, published and removed from the queue', async () => {
  const requests: string[] = []
  const cover = Buffer.from('complete-image')
  const f = fixture({
    asset: async (path: string) => {
      requests.push(path)
      return new Response(cover, { headers: { 'content-type': 'image/png' } })
    }
  } as unknown as RommClient)
  f.store.updateSettings({ enrichEsde: true, romStorage: 'emulator' })
  f.answer({ state: 'done', needed: ['covers'] })
  await f.worker.completed(
    {
      ...rom,
      path_cover_large:
        '/assets/romm/resources/roms/1/8/cover/big.png?ts=2026-01-02 03:04:05.123456+00:00'
    },
    entry
  )
  await until(() => !existsSync(join(f.root, 'config/esde-pending/8.json')))
  assert.deepEqual(requests, ['/assets/romm/resources/roms/1/8/cover/big.png'])
  assert.deepEqual(f.published, [cover])
  assert.deepEqual(readdirSync(join(f.root, 'config/esde-pending/media')), [])
})
test('shared storage and foreign emulators cannot publish', async () => {
  const f = fixture()
  f.store.updateSettings({ enrichEsde: true })
  await f.worker.completed(rom, entry)
  f.store.updateSettings({ romStorage: 'emulator' })
  await f.worker.completed(rom, { ...entry, emulatorId: 'retrodeck' })
  assert.equal(f.called(), 0)
})
test('pending completion survives deferral and disabled preference, then retries', async () => {
  const f = fixture()
  f.store.updateSettings({ enrichEsde: true, romStorage: 'emulator' })
  await f.worker.completed(rom, entry)
  await quiet()
  const queue = join(f.root, 'config/esde-pending')
  assert.deepEqual(readdirSync(queue), ['8.json'])
  f.store.updateSettings({ enrichEsde: false })
  const before = f.called()
  await f.worker.drain()
  assert.equal(f.called(), before)
  f.store.updateSettings({ enrichEsde: true })
  f.answer({ state: 'done' })
  await f.worker.drain()
  assert.deepEqual(readdirSync(queue), [])
})
test('pending metadata is isolated from a newly connected server', async () => {
  const f = fixture()
  f.store.updateSettings({ enrichEsde: true, romStorage: 'emulator' })
  await f.worker.completed(rom, entry)
  await quiet()
  f.store.setServer({ baseUrl: 'https://different.example', authMode: 'device' })
  const before = f.called()
  f.answer({ state: 'done' })
  await f.worker.drain()
  assert.equal(f.called(), before)
  assert.deepEqual(readdirSync(join(f.root, 'config/esde-pending')), ['8.json'])
})

test('incomplete video stays pending and a complete retry publishes and cleans staging', async () => {
  let attempts = 0
  const video = Buffer.from('complete-video')
  const client = {
    asset: async () => {
      attempts++
      return new Response(attempts === 1 ? video.subarray(0, 3) : video, {
        headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) }
      })
    }
  } as unknown as RommClient
  const f = fixture(client)
  f.store.updateSettings({ enrichEsde: true, romStorage: 'emulator' })
  f.answer({ state: 'done', needed: ['videos'] })
  await f.worker.completed({ ...rom, path_video: 'roms/8/video.mp4' }, entry)
  await until(async () => !!(await f.worker.status()).reason)
  const queue = join(f.root, 'config/esde-pending')
  assert.equal(attempts, 1)
  assert.equal(existsSync(join(queue, '8.json')), true)
  assert.deepEqual(readdirSync(join(queue, 'media')), [])
  assert.deepEqual(f.published, [])
  await f.worker.drain()
  assert.equal(attempts, 2)
  assert.deepEqual(f.published, [video])
  assert.equal(existsSync(join(queue, '8.json')), false)
  assert.deepEqual(readdirSync(join(queue, 'media')), [])
})

test('existing ES-DE video does not cause a redundant server transfer', async () => {
  let attempts = 0
  const f = fixture({
    asset: async () => {
      attempts++
      throw new Error('Unexpected transfer')
    }
  } as unknown as RommClient)
  f.store.updateSettings({ enrichEsde: true, romStorage: 'emulator' })
  f.answer({ state: 'done', needed: [] })
  await f.worker.completed({ ...rom, path_video: 'roms/8/video.mp4' }, entry)
  await until(() => !existsSync(join(f.root, 'config/esde-pending/8.json')))
  assert.equal(attempts, 0)
  assert.equal(existsSync(join(f.root, 'config/esde-pending/8.json')), false)
})

test('a corrupt queue entry does not starve later completed downloads', async () => {
  const f = fixture()
  f.store.updateSettings({ enrichEsde: true, romStorage: 'emulator' })
  await f.worker.completed(rom, entry)
  await quiet()
  const queue = join(f.root, 'config/esde-pending')
  writeFileSync(join(queue, '1.json'), '{truncated')
  f.answer({ state: 'done' })
  await f.worker.drain()
  assert.deepEqual(readdirSync(queue), ['1.json'])
  assert.match((await f.worker.status()).reason!, /JSON|property/i)
})

test('a failed media request does not starve the next queued game', async () => {
  const f = fixture({
    asset: async () => {
      throw new Error('offline media')
    }
  } as unknown as RommClient)
  f.store.updateSettings({ enrichEsde: true, romStorage: 'emulator' })
  await f.worker.completed({ ...rom, path_video: 'roms/8/video.mp4' }, entry)
  await quiet()
  const next = { ...entry, romId: 9 }
  f.store.addInstalled(next)
  await f.worker.completed({ ...rom, id: 9 }, next)
  await quiet()
  f.answer({ state: 'done', needed: ['videos'] })
  await f.worker.drain()
  assert.equal(existsSync(join(f.root, 'config/esde-pending/8.json')), true)
  assert.equal(existsSync(join(f.root, 'config/esde-pending/9.json')), false)
})

for (const change of ['disable', 'storage', 'server', 'remove', 'replace', 'stop'] as const) {
  test(`media publication revalidates ${change} after an in-flight transfer`, async () => {
    let started!: () => void
    const fetching = new Promise<void>((resolve) => {
      started = resolve
    })
    let respond!: (response: Response) => void
    const response = new Promise<Response>((resolve) => {
      respond = resolve
    })
    const f = fixture({
      asset: () => {
        started()
        return response
      }
    } as unknown as RommClient)
    f.store.updateSettings({ enrichEsde: true, romStorage: 'emulator' })
    await f.worker.completed({ ...rom, path_video: 'roms/8/video.mp4' }, entry)
    await quiet()
    f.answer({ state: 'done', needed: ['videos'] })
    const draining = f.worker.drain()
    await fetching
    const calls = f.called()
    if (change === 'disable') f.store.updateSettings({ enrichEsde: false })
    if (change === 'storage') f.store.updateSettings({ romStorage: 'rommix' })
    if (change === 'server')
      f.store.setServer({ baseUrl: 'https://other.example', authMode: 'device' })
    if (change === 'remove') f.store.removeInstalled(entry.romId)
    if (change === 'replace')
      f.store.addInstalled({ ...entry, installedAt: '2026-11-07T01:00:00Z' })
    if (change === 'stop') f.worker.stop()
    respond(new Response('video', { headers: { 'content-type': 'video/mp4' } }))
    await draining
    assert.equal(f.called(), calls, 'stale media must not reach the writer')
    assert.deepEqual(f.published, [])
    assert.equal(existsSync(join(f.root, 'config/esde-pending/8.json')), true)
  })
}
