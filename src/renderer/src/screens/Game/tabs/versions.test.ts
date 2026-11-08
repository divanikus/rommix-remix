import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { RommRom, RommSiblingRom } from '@shared/types'
import { markedVersion, pickedVersion, pickQuery, versionRows } from './versions.ts'

/**
 * Which version stands for a game, and who chose it.
 *
 * The two answers are drawn as different labels, so mixing them up is a row
 * telling somebody they chose a version they never touched.
 */

function rom(id: number, marked = false): RommRom {
  return {
    id,
    name: 'Cave Story',
    fs_name_no_tags: 'cavestory',
    platform_id: 3,
    rom_user: { is_main_sibling: marked }
  } as unknown as RommRom
}

function sibling(id: number, marked = false): RommSiblingRom {
  return { id, is_main_sibling: marked } as RommSiblingRom
}

describe('readable version labels', () => {
  const one = { id: 1, name: 'Moon Fighters (Japan)', fs_name_no_ext: 'moonfj' }
  const two = { id: 2, name: 'Moon Fighters (World)', fs_name_no_ext: 'moonfw' }

  test('uses distinct metadata titles and keeps the short filenames visible', () => {
    assert.deepEqual(versionRows(one, [two]), [
      { id: 1, fsNameNoExt: 'moonfj', title: one.name, filename: 'moonfj' },
      { id: 2, fsNameNoExt: 'moonfw', title: two.name, filename: 'moonfw' }
    ])
  })

  test('retains region, revision and translation filenames when titles are shared', () => {
    const rows = versionRows(
      { ...one, name: 'Moon Fighters', fs_name_no_ext: 'Moon Fighters (Japan)' },
      [{ ...two, name: 'Moon Fighters', fs_name_no_ext: 'Moon Fighters (USA) (Rev 1) [T-En]' }]
    )
    assert.deepEqual(
      rows.map(({ title, filename }) => [title, filename]),
      [
        ['Moon Fighters (Japan)', null],
        ['Moon Fighters (USA) (Rev 1) [T-En]', null]
      ]
    )
  })

  test('ignores case and spacing differences in otherwise shared titles', () => {
    const rows = versionRows({ ...one, name: ' Moon Fighters ' }, [
      { ...two, name: 'MOON  FIGHTERS' }
    ])
    assert.deepEqual(
      rows.map((row) => row.title),
      ['moonfj', 'moonfw']
    )
  })

  test('keeps missing and blank metadata usable in a group with distinct titles', () => {
    const rows = versionRows(one, [
      two,
      { id: 3, name: null, fs_name_no_ext: 'moonfx' },
      { id: 4, name: '  ', fs_name_no_ext: 'moonfy' }
    ])
    assert.deepEqual(
      rows.slice(2).map(({ title, filename }) => [title, filename]),
      [
        ['moonfx', null],
        ['moonfy', null]
      ]
    )
  })

  test('does not infer distinct titles from absent metadata', () => {
    assert.deepEqual(
      versionRows({ ...one, name: null }, [{ ...two, name: null }]).map((row) => row.title),
      ['moonfj', 'moonfw']
    )
    assert.equal(versionRows(one, [{ ...two, name: null }])[0].title, 'moonfj')
  })

  test('does not repeat a filename that is already the displayed title', () => {
    const row = versionRows({ ...one, fs_name_no_ext: one.name }, [two])[0]
    assert.equal(row.title, one.name)
    assert.equal(row.filename, null)
  })

  test('keeps filenames to distinguish repeated names within a mixed group', () => {
    const rows = versionRows(one, [two, { ...one, id: 3, fs_name_no_ext: 'moonfj2' }])
    assert.deepEqual(
      rows.map(({ title, filename }) => [title, filename]),
      [
        [one.name, 'moonfj'],
        [one.name, 'moonfj2'],
        [two.name, 'moonfw']
      ]
    )
  })

  test('keeps row order and exact ROM IDs when opening another version', () => {
    assert.deepEqual(versionRows(two, [one]), versionRows(one, [two]))
    assert.deepEqual(
      versionRows(two, [one]).map((row) => row.id),
      [1, 2]
    )
  })
})

describe('the version this user marked', () => {
  test('is the one open, where it carries the mark', () => {
    assert.equal(markedVersion(rom(1, true), [sibling(2)]), 1)
  })

  test('or the sibling that carries it', () => {
    assert.equal(markedVersion(rom(1), [sibling(2), sibling(3, true)]), 3)
  })

  test('and nothing where none is marked, which is RomM’s pick to name', () => {
    assert.equal(markedVersion(rom(1), [sibling(2), sibling(3)]), undefined)
  })
})

describe('the version RomM picks', () => {
  test('is asked for as a grouped grid asks, narrowed to this game', () => {
    assert.deepEqual(pickQuery(rom(1)), {
      group_by_meta_id: true,
      platform_ids: [3],
      search_term: 'Cave Story'
    })
  })

  test('and searched by file name where the game has no name', () => {
    assert.equal(pickQuery({ ...rom(1), name: null }).search_term, 'cavestory')
  })

  test('is the version of this game among the rows returned', () => {
    // The search can bring back other games sharing words with this one.
    const items = [{ id: 40 }, { id: 3 }, { id: 41 }]
    assert.equal(pickedVersion(items, rom(1), [sibling(2), sibling(3)]), 3)
  })

  test('and nothing where none of them came back', () => {
    assert.equal(pickedVersion([{ id: 40 }], rom(1), [sibling(2)]), null)
  })
})
