import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gameBrowse } from './game-browse.ts'
import { pushRoute, popRoute, type Route } from './history.ts'
import type { GameTile } from './components/tiles.ts'

const tiles = [
  { romId: 1, title: 'First', group: [1, 101] },
  { romId: 2, title: 'Second' },
  { romId: 3, title: 'Third' }
] as GameTile[]

test('game neighbors retain the query and prefer the installed version without changing group identity', () => {
  const query = {
    platform_ids: [7],
    search_term: 'test',
    genres: ['Shooter'],
    order_dir: 'desc' as const
  }
  const browse = gameBrowse(tiles, 1, new Set([101]), query, true)
  assert.equal(browse.items[0].openId, 101)
  assert.equal(browse.items[0].id, 1)
  assert.deepEqual(browse.query, query)
  assert.equal(browse.offset, 3)
})

test('neighbors and versions keep one Back step and restore exact source selection, filters and depth', () => {
  const browse = gameBrowse(tiles, 1, new Set([101]))
  const source: Route = {
    name: 'collection',
    collectionId: 'franchise:test',
    title: 'Test',
    view: { scope: 'all', search: 'he', layout: 'list', held: 2 }
  }
  const start = pushRoute([source], { name: 'game', romId: 101, browse })
  const next = pushRoute(start, { name: 'game', romId: 2, browse: { ...browse, index: 1 } })
  assert.equal(next.length, 2)
  const changed = pushRoute(next, {
    name: 'game',
    romId: 202,
    fromVersions: true,
    replaceGame: true,
    browse: { ...browse, index: 1 }
  })
  const back = popRoute(changed)
  assert.equal(back.length, 1)
  assert.deepEqual(back[0], {
    ...source,
    view: { ...source.view, romId: 2, versionId: 202, held: 3 }
  })
})
