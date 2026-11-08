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
