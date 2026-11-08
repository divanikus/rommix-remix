import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { groupLaunchDirectory } from './launch-directory.ts'
import type { InstallResult } from './install.ts'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(): Promise<InstallResult> {
  const root = await mkdtemp(join(tmpdir(), 'rommix-launch-dir-'))
  roots.push(root)
  const path = join(root, 'set')
  await mkdir(join(path, 'set'), { recursive: true })
  await writeFile(join(path, 'set.7z'), 'program')
  await writeFile(join(path, 'set/disk.chd'), 'disk')
  return {
    path,
    launchPath: join(path, 'set.7z'),
    isDirectory: true,
    files: ['set.7z', 'set/disk.chd'],
    sizeBytes: 11
  }
}

test('a matching archive directory retains its exact files and launch target', async () => {
  const input = await fixture()
  const output = await groupLaunchDirectory(input, ['.7z'])
  assert.equal(output.path, input.path + '.7z')
  assert.equal(output.launchPath, join(output.path, 'set.7z'))
  assert.equal(await readFile(output.launchPath, 'utf8'), 'program')
  assert.equal(await readFile(join(output.path, 'set/disk.chd'), 'utf8'), 'disk')
  assert.deepEqual(output.files, input.files)
  assert.equal(output.sizeBytes, input.sizeBytes)
  assert.equal(await stat(input.path).catch(() => null), null)
})

for (const directory of [false, true]) {
  test(`an existing ${directory ? 'directory' : 'file'} is never replaced`, async () => {
    const input = await fixture()
    const target = input.path + '.7z'
    if (directory) await mkdir(target)
    const owner = directory ? join(target, 'owner.txt') : target
    await writeFile(owner, 'owner')
    assert.equal(await groupLaunchDirectory(input, ['.7z']), input)
    assert.equal(await readFile(owner, 'utf8'), 'owner')
    assert.equal(await readFile(input.launchPath, 'utf8'), 'program')
  })
}

test('unsupported, unmatched, nested or missing launch files keep the package unchanged', async () => {
  const input = await fixture()
  assert.equal(await groupLaunchDirectory(input, []), input)
  for (const launchPath of [join(input.path, 'other.7z'), join(input.path, 'set/set.7z')]) {
    await writeFile(launchPath, 'other')
    const changed = { ...input, launchPath }
    assert.equal(await groupLaunchDirectory(changed, ['.7z']), changed)
  }
  await rm(input.launchPath)
  assert.equal(await groupLaunchDirectory(input, ['.7z']), input)
})

async function discFixture(
  files: Record<string, string>,
  launch = Object.keys(files)[0]
): Promise<InstallResult> {
  const root = await mkdtemp(join(tmpdir(), 'rommix-disc-dir-'))
  roots.push(root)
  const path = join(root, 'Package')
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(path, name, '..'), { recursive: true })
    await writeFile(join(path, name), body)
  }
  return {
    path,
    launchPath: join(path, launch),
    isDirectory: true,
    files: Object.keys(files),
    sizeBytes: Object.values(files).reduce((sum, body) => sum + Buffer.byteLength(body), 0)
  }
}

test('existing playlist bytes, comments and order survive a differently named package', async () => {
  const body = '\uFEFF#EXTM3U\r\n# owner order\r\n./Disc 2.chd\r\nDisc 1.chd\r\n'
  const input = await discFixture({
    'Launch.m3u': body,
    'Disc 1.chd': 'first',
    'Disc 2.chd': 'second'
  })
  const result = await groupLaunchDirectory(input, ['.m3u'])
  assert.equal(result.path, join(input.path, '../Launch.m3u'))
  assert.equal(await readFile(result.launchPath, 'utf8'), body)
  assert.deepEqual(result.files, input.files)
  assert.equal(result.sizeBytes, input.sizeBytes)
})

test('a single CUE groups without changing track references or needing M3U', async () => {
  const input = await discFixture({
    'Disc.cue': 'FILE "tracks/track.bin" BINARY',
    'tracks/track.bin': 'track'
  })
  const output = await groupLaunchDirectory(input, ['.cue'])
  assert.equal(output.launchPath, join(input.path, '../Disc.cue/Disc.cue'))
  assert.equal(await readFile(join(output.path, 'tracks/track.bin'), 'utf8'), 'track')
  assert.deepEqual(output.files, input.files)
})

for (const reference of [
  'missing.chd',
  '../outside.chd',
  '/absolute/Game.chd',
  'https://example.com/game.chd',
  'Game.m3u'
]) {
  test(`playlist reference ${reference} prevents moving the package`, async () => {
    const input = await discFixture({ 'Game.m3u': reference, 'Game.chd': 'disc' })
    assert.equal(await groupLaunchDirectory(input, ['.m3u']), input)
  })
}

test('ambiguous disc sets, broken tracks, nested launchers and unsupported formats stay visible', async () => {
  const cases: Record<string, string>[] = [
    { 'One.m3u': 'Game.chd', 'Two.m3u': 'Game.chd', 'Game.chd': 'disc' },
    {
      'One.cue': 'FILE "one.bin" BINARY',
      'one.bin': 'one',
      'Two.cue': 'FILE "two.bin" BINARY',
      'two.bin': 'two'
    },
    { 'Game.cue': 'FILE "missing.bin" BINARY' },
    { 'Nested/Game.m3u': 'Game.chd', 'Nested/Game.chd': 'disc' }
  ]
  for (const files of cases) {
    const input = await discFixture(files)
    assert.equal(await groupLaunchDirectory(input, ['.m3u', '.cue']), input)
  }
  const unsupported = await discFixture({
    'Game.cue': 'FILE "track.bin" BINARY',
    'track.bin': 'track'
  })
  assert.equal(await groupLaunchDirectory(unsupported, ['.m3u']), unsupported)
  await writeFile(join(unsupported.path, '../Game.cue'), 'owner file')
  assert.equal(await groupLaunchDirectory(unsupported, ['.cue']), unsupported)
})
