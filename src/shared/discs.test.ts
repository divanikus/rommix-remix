import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recognizeDiscs, type DiscFile } from './discs.ts'
import { m3uFormats } from '../config/emulators/playlists.ts'
import { romFileName, newFilesOf } from './gamefiles.ts'

const formats = ['.cue', '.gdi', '.chd', '.iso', '.cdi']
const files = (...names: string[]): DiscFile[] => names.map((name) => ({ name }))
const cueSet: DiscFile[] = [
  { name: 'Game (Disc 2).cue', text: 'FILE "Disc 2/track.bin" BINARY\n TRACK 01 MODE1/2352' },
  {
    name: 'Game (Disc 1).cue',
    text: 'FILE "Disc 1/track.bin" BINARY\nFILE "Disc 1/audio.bin" BINARY'
  },
  ...files('Disc 1/track.bin', 'Disc 1/audio.bin', 'Disc 2/track.bin')
]

test('CUEs are discs, BINs are tracks, and order is numeric rather than server order', () => {
  assert.deepEqual(recognizeDiscs(cueSet, formats), {
    state: 'ready',
    discs: ['Game (Disc 1).cue', 'Game (Disc 2).cue']
  })
  const ten = Array.from({ length: 10 }, (_, i) => ({ name: `Game (Disk ${10 - i} of 10).chd` }))
  assert.deepEqual(recognizeDiscs(ten, formats), {
    state: 'ready',
    discs: ten.toReversed().map((file) => file.name)
  })
})

test('disc numbers in folders and GDI dependencies work without a platform parameter', () => {
  const set = [2, 1].flatMap((n) => [
    {
      name: `Disc ${n}/Game.gdi`,
      text: '2\n1 0 4 2352 track01.bin 0\n2 45000 0 2352 "track 02.raw" 0'
    },
    ...files(`Disc ${n}/track01.bin`, `Disc ${n}/track 02.raw`)
  ])
  assert.deepEqual(recognizeDiscs(set, formats), {
    state: 'ready',
    discs: ['Disc 1/Game.gdi', 'Disc 2/Game.gdi']
  })
})

test('Roman disc labels and totals sort by value, including subtractive numbers', () => {
  const labels = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
  const names = labels.map((label) => `Any title (Disk ${label} of X).chd`)
  assert.deepEqual(recognizeDiscs(files(...names.toReversed()), formats), {
    state: 'ready',
    discs: names
  })
  assert.deepEqual(
    recognizeDiscs(files('cd_ii/Game (Disc 2).iso', 'cd_i/Game (Disc 1).iso'), formats),
    { state: 'ready', discs: ['cd_i/Game (Disc 1).iso', 'cd_ii/Game (Disc 2).iso'] }
  )
})

test('a consecutive set may include disc zero, which remains first', () => {
  const names = [0, 1, 2, 3].map((number) => `Another title (Disc ${number}).chd`)
  assert.deepEqual(recognizeDiscs(files(...names.toReversed()), formats), {
    state: 'ready',
    discs: names
  })
  const counted = [0, 1, 2].map((number) => `Game (Disc ${number} of 3).chd`)
  assert.deepEqual(recognizeDiscs(files(...counted), formats), { state: 'ready', discs: counted })
})

for (const [label, set] of Object.entries({
  'single multitrack disc': cueSet.filter((file) => !file.name.includes('2')),
  'raw tracks': files('Game (Track 1).bin', 'Game (Track 2).bin'),
  'unnumbered images': files('first.chd', 'second.chd'),
  'missing disc': files('Game (Disc 1).chd', 'Game (Disc 3).chd'),
  'gap after disc zero': files('Game (Disc 0).chd', 'Game (Disc 2).chd'),
  'set starting after one': files('Game (Disc II).chd', 'Game (Disc III).chd'),
  'missing Roman final disc': files('Game (Disc I of III).chd', 'Game (Disc II of III).chd'),
  'duplicate Roman and Arabic numbers': files('Game (Disc I).chd', 'Game (Disc 1).chd'),
  'noncanonical Roman label': files('Game (Disc I).chd', 'Game (Disc IIII).chd'),
  'noncanonical Roman total': files('Game (Disc I of IIX).chd', 'Game (Disc II of IIX).chd'),
  'conflicting folder and filename numbers': files(
    'Disc I/Game (Disc II).chd',
    'Disc II/Game (Disc I).chd'
  ),
  'known missing final disc': files('Game (Disc 1 of 3).chd', 'Game (Disc 2 of 3).chd'),
  'duplicate versions': files('Game (Disc 1).iso', 'Game (Disc 1).chd'),
  'mixed games': files('One (Disc 1).chd', 'Two (Disc 2).chd'),
  'mixed regions': files('Game (USA) (Disc 1).chd', 'Game (Europe) (Disc 2).chd'),
  'arcade program and CHDs': files('game.zip', 'game (Disc 1).chd', 'game (Disc 2).chd'),
  'existing playlist': [...cueSet, ...files('Owner.M3U')],
  'missing CUE track': cueSet.slice(0, -1),
  'malformed descriptor': cueSet.map((file) => (file.text ? { ...file, text: 'FILE bad' } : file)),
  'escaping reference': cueSet.map((file) =>
    file.text ? { ...file, text: 'FILE "../outside.bin" BINARY' } : file
  ),
  'shared track masquerading as two discs': [
    { name: 'Game (Disc 1).cue', text: 'FILE "same.bin" BINARY' },
    { name: 'Game (Disc 2).cue', text: 'FILE "same.bin" BINARY' },
    ...files('same.bin')
  ],
  'newline in a filename': files('Game (Disc 1)\n.chd', 'Game (Disc 2)\n.chd')
})) {
  test(`declines ${label}`, () => assert.equal(recognizeDiscs(set, formats).state, 'skip'))
}

test('capabilities belong to runners, including a recorded choice and unknown choices', () => {
  const options = [
    { id: 'one', label: 'One', m3u: ['.cue', '.chd'] },
    { id: 'two', label: 'Two', m3u: ['.chd'] }
  ]
  assert.deepEqual(m3uFormats(options), ['.chd'])
  assert.deepEqual(m3uFormats(options, 'one'), ['.cue', '.chd'])
  assert.deepEqual(m3uFormats(options, 'missing'), [])
  assert.deepEqual(m3uFormats([...options, { id: 'unknown', label: 'Unknown' }]), [])
  assert.deepEqual(recognizeDiscs(cueSet, ['.chd']), { state: 'skip', reason: 'unsupported' })
})

test('RomM nested filenames are relative to the exact ROM, never just the basename', () => {
  const rom = { fs_path: 'roms/custom', fs_name: 'Game' }
  const one = { file_name: 'track.bin', file_path: 'roms/custom/Game/Disc 1' }
  const two = { file_name: 'track.bin', file_path: 'roms/custom/Game/Disc 2' }
  assert.equal(romFileName(one, rom), 'Disc 1/track.bin')
  assert.equal(romFileName({ ...one, file_path: 'roms/custom/Game' }, rom), 'track.bin')
  assert.equal(romFileName({ ...one, file_path: 'roms/custom/Game-other' }, rom), null)
  assert.equal(romFileName({ ...one, file_path: 'roms/custom/Game/../other' }, rom), null)
  assert.deepEqual(
    newFilesOf([one, two], { path: '/local/Game', files: ['Disc 1/track.bin'] }, rom),
    [two]
  )
})
