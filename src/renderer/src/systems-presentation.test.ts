import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RommPlatform } from '@shared/types'
import { groupSystems, readSystems, platformGeneration } from './systems-presentation.ts'

test('platform groups use server metadata, preserve unknowns and sort generations numerically', () => {
  const items = [
    { id: 1, display_name: 'A', rom_count: 4, generation: 10 },
    { id: 2, display_name: 'B', rom_count: 9, generation: 2 },
    { id: 3, display_name: 'C', rom_count: 1 }
  ] as RommPlatform[]
  const prefs = readSystems({ getItem: () => null })
  assert.deepEqual(
    groupSystems(items, { ...prefs, groupBy: 'generation' }, () => 0).map((g) => g.key),
    ['2', '10', '']
  )
  assert.deepEqual(
    groupSystems(items, { ...prefs, sort: 'count', direction: 'desc' }, () => 0)[0].items.map(
      (p) => p.id
    ),
    [2, 1, 3]
  )
  assert.deepEqual(
    groupSystems(items, { ...prefs, groupBy: 'local' }, (p) => (p.id === 2 ? 1 : 0)).map((g) => [
      g.key,
      g.items.length
    ]),
    [
      ['local', 1],
      ['remote', 2]
    ]
  )
  assert.deepEqual(
    items.map((p) => p.id),
    [1, 2, 3]
  )
})
test('invalid stored platform presentation falls back safely', () => {
  assert.equal(readSystems({ getItem: () => '{broken' }).layout, 'grid')
  assert.equal(readSystems({ getItem: () => 'null' }).groupBy, 'none')
})

test('RomM generation sentinels stay unknown and generation groups stay chronological', () => {
  const items = [
    { id: 1, display_name: 'Arcade', rom_count: 9, generation: -1 },
    { id: 2, display_name: 'Unknown zero', rom_count: 3, generation: 0 },
    { id: 3, display_name: 'Unknown null', rom_count: 1, generation: null },
    { id: 4, display_name: 'Later', rom_count: 4, generation: 10 },
    { id: 5, display_name: 'Earlier', rom_count: 6, generation: 2 },
    { id: 6, display_name: 'Missing', rom_count: 2 }
  ] as RommPlatform[]
  for (const direction of ['asc', 'desc'] as const) {
    const groups = groupSystems(
      items,
      { ...readSystems({ getItem: () => null }), groupBy: 'generation', sort: 'count', direction },
      () => 0
    )
    assert.deepEqual(
      groups.map((g) => g.key),
      ['2', '10', '']
    )
    assert.deepEqual(
      groups.at(-1)!.items.map((p) => p.id),
      direction === 'asc' ? [3, 6, 2, 1] : [1, 2, 6, 3]
    )
  }
  assert.equal(platformGeneration(items[0]), null)
  assert.equal(platformGeneration({ generation: NaN }), null)
  assert.equal(platformGeneration({ generation: Infinity }), null)
  assert.equal(platformGeneration(items[4]), 2)
})
