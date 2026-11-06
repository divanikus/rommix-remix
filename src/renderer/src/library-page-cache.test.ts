import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RommRomPage, RomQuery } from '@shared/types'
import { createLibraryPageCache } from './library-page-cache.ts'

const page = (query: RomQuery): RommRomPage => ({
  items: [],
  total: 0,
  limit: query.limit ?? 60,
  offset: query.offset ?? 0
})
test('neighbor metadata is shared with entry, bounded, query-specific and short-lived', async () => {
  let calls = 0,
    time = 0
  const cache = createLibraryPageCache(
    async (query) => {
      calls++
      return page(query)
    },
    60,
    () => time
  )
  const query: RomQuery = {
    platform_ids: [1],
    search_term: 'test',
    order_dir: 'asc',
    limit: 60,
    offset: 0
  }
  const first = await cache.read(query)
  assert.equal(cache.peek(query), first)
  assert.equal(
    await cache.read({
      offset: 0,
      limit: 60,
      order_dir: 'asc',
      search_term: 'test',
      platform_ids: [1]
    }),
    first
  )
  assert.equal(calls, 1)
  assert.equal(cache.peek({ ...query, order_dir: 'desc' }), undefined)
  await cache.read({ ...query, offset: 60 })
  await cache.read({ ...query, offset: 60 })
  assert.equal(calls, 3, 'Later pages never use the neighbor cache')
  for (let id = 2; id <= 6; id++) await cache.read({ ...query, platform_ids: [id] })
  assert.equal(cache.peek(query), undefined, 'Only five first pages may be retained')
  time = 31_000
  assert.equal(cache.peek({ ...query, platform_ids: [6] }), undefined)
})

test('one pending read per query; clearing cannot be undone by a late response', async () => {
  let resolve!: (value: RommRomPage) => void
  const cache = createLibraryPageCache(
    () =>
      new Promise((done) => {
        resolve = done
      }),
    60
  )
  const query = { limit: 60, offset: 0 }
  const first = cache.read(query)
  assert.equal(cache.read(query), first)
  cache.clear()
  resolve(page(query))
  await first
  assert.equal(cache.peek(query), undefined)
})

test('failed prefetch can be retried on real entry', async () => {
  let calls = 0
  const cache = createLibraryPageCache(async (query) => {
    if (++calls === 1) throw Error('offline')
    return page(query)
  }, 60)
  await assert.rejects(cache.read({ limit: 60 }), /offline/)
  await cache.read({ limit: 60 })
  assert.equal(calls, 2)
})
