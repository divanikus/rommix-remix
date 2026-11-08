import { lstat, open, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, extname, join, relative } from 'node:path'
import { discPath, recognizeDiscs } from '@shared/discs'
import { filePathsUnder, type InstallResult } from './install.ts'
import { safeJoin } from './safepath.ts'
import { log } from './log.ts'

/** Only called for a fresh completed download, never adoption or added files. */
export async function prepareMultidisc(
  installed: InstallResult,
  supported: readonly string[],
  directoryAsFile: boolean
): Promise<InstallResult> {
  if (!installed.isDirectory || !supported.length) return installed
  const files = await filePathsUnder(installed.path)
  const contents = await Promise.all(
    files.map(async (path) => {
      const name = relative(installed.path, path).split('\\').join('/')
      const info = await lstat(path)
      const text =
        ['.cue', '.gdi'].includes(extname(path).toLowerCase()) && info.size <= 1024 * 1024
          ? await readFile(path, 'utf8')
          : undefined
      return { name, text }
    })
  )
  const result = recognizeDiscs(contents, supported)
  if (result.state !== 'ready') {
    if (!['single', 'playlist'].includes(result.reason))
      log.info('install', 'disc playlist not generated', {
        path: installed.path,
        reason: result.reason
      })
    return installed
  }
  const name = basename(installed.path) + '.m3u'
  if (!discPath(name)) return installed
  const playlist = await safeJoin(installed.path, name)
  if (!playlist) return installed
  // The target may belong to an existing library even though this download is new.
  const target = directoryAsFile ? await safeJoin(dirname(installed.path), name) : installed.path
  if (!target || (target !== installed.path && (await lstat(target).catch(() => null)))) {
    log.info('install', 'playlist directory already exists; keeping the downloaded layout', {
      path: target
    })
    return installed
  }
  const body = result.discs.map((disc) => './' + disc).join('\n') + '\n'
  let output
  try {
    output = await open(playlist, 'wx', 0o644)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return installed
    throw error
  }
  try {
    await output.writeFile(body, 'utf8')
    await output.sync()
  } catch (error) {
    await output.close()
    await unlink(playlist)
    throw error
  }
  await output.close()
  try {
    if (target !== installed.path) await rename(installed.path, target)
  } catch (error) {
    await unlink(playlist)
    throw error
  }
  log.info('install', 'created a disc playlist', { path: target, discs: result.discs.length })
  return {
    ...installed,
    path: target,
    launchPath: join(target, name),
    files: [...contents.map((file) => file.name), name].sort(),
    sizeBytes: installed.sizeBytes + Buffer.byteLength(body),
    playlist: { file: name, discs: result.discs }
  }
}
