import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareMultidisc } from './multidisc.ts'
import { directorySize, installedFiles, type InstallResult } from './install.ts'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture(
  extra: Record<string, string> = {},
  labels: (number | string)[] = [1, 2]
): Promise<InstallResult> {
  const root = await mkdtemp(join(tmpdir(), 'rommix-m3u-'))
  roots.push(root)
  const path = join(root, 'Game')
  const files = {
    ...Object.fromEntries(
      labels.flatMap((label, index) => [
        [`Disc ${label}/Game.cue`, 'FILE "track.bin" BINARY'],
        [`Disc ${label}/track.bin`, index === 0 ? 'first' : 'second']
      ])
    ),
    ...extra
  }
  for (const [name, body] of Object.entries(files)) {
    const parts = name.split('/')
    await mkdir(join(path, ...parts.slice(0, -1)), { recursive: true })
    await writeFile(join(path, name), body)
  }
  return {
    path,
    launchPath: join(path, `Disc ${labels[0]}/Game.cue`),
    isDirectory: true,
    files: await installedFiles(path),
    sizeBytes: await directorySize(path)
  }
}

test('generated playlist, index, sizes and all relative tracks agree after ES-DE grouping', async () => {
  const input = await fixture()
  const output = await prepareMultidisc(input, ['.cue'], true)
  assert.equal(output.path, input.path + '.m3u')
  assert.equal(output.launchPath, join(output.path, 'Game.m3u'))
  assert.equal(await readFile(output.launchPath, 'utf8'), './Disc 1/Game.cue\n./Disc 2/Game.cue\n')
  assert.equal(await readFile(join(output.path, 'Disc 2/track.bin'), 'utf8'), 'second')
  assert.deepEqual(
    output.files,
    (await installedFiles(output.path)).map((name) => name.replaceAll('\\', '/'))
  )
  assert.equal(output.sizeBytes, await directorySize(output.path))
  assert.deepEqual(output.playlist?.discs, ['Disc 1/Game.cue', 'Disc 2/Game.cue'])
  assert.equal(await stat(input.path).catch(() => null), null)
})

for (const labels of [
  [0, 1, 2, 3],
  ['I', 'II', 'III']
]) {
  test(`playlist generation retains every disc in ${labels.join(', ')} order`, async () => {
    const input = await fixture({}, labels.toReversed())
    const output = await prepareMultidisc(input, ['.cue'], true)
    const discs = labels.map((label) => `Disc ${label}/Game.cue`)
    assert.deepEqual(output.playlist?.discs, discs)
    assert.equal(
      await readFile(output.launchPath, 'utf8'),
      discs.map((name) => './' + name + '\n').join('')
    )
    assert.equal(output.sizeBytes, await directorySize(output.path))
  })
}

test('ordinary library gets a playlist without an ES-DE directory change', async () => {
  const input = await fixture()
  const output = await prepareMultidisc(input, ['.cue'], false)
  assert.equal(output.path, input.path)
  assert.equal(await readFile(output.launchPath, 'utf8'), './Disc 1/Game.cue\n./Disc 2/Game.cue\n')
})

test('existing playlists and conflicting owner directories stay untouched', async () => {
  const existing = await fixture({
    'Owner.m3u': '# owner order\nDisc 2/Game.cue\nDisc 1/Game.cue\n'
  })
  assert.equal(await prepareMultidisc(existing, ['.cue'], true), existing)
  assert.equal(
    await readFile(join(existing.path, 'Owner.m3u'), 'utf8'),
    '# owner order\nDisc 2/Game.cue\nDisc 1/Game.cue\n'
  )
  const input = await fixture()
  await mkdir(input.path + '.m3u')
  await writeFile(join(input.path + '.m3u', 'owner.txt'), 'keep')
  assert.equal(await prepareMultidisc(input, ['.cue'], true), input)
  assert.equal(await readFile(join(input.path + '.m3u', 'owner.txt'), 'utf8'), 'keep')
  assert.equal(await stat(join(input.path, 'Game.m3u')).catch(() => null), null)
})

test('incomplete and unsupported disc sets do not get a playlist', async () => {
  const input = await fixture()
  assert.equal(await prepareMultidisc(input, [], true), input)
  await rm(join(input.path, 'Disc 2/track.bin'))
  assert.equal(await prepareMultidisc(input, ['.cue'], true), input)
  assert.equal(await stat(join(input.path, 'Game.m3u')).catch(() => null), null)
})
