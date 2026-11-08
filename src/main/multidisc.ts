import { open, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { discPath, recognizeDiscs } from '@shared/discs'
import type { InstallResult } from './install.ts'
import { readDiscFiles } from './disc-files.ts'
import { safeJoin } from './safepath.ts'
import { log } from './log.ts'

/** Only called for a fresh completed download, never adoption or added files. */
export async function prepareMultidisc(
  installed: InstallResult,
  supported: readonly string[]
): Promise<InstallResult> {
  if (!installed.isDirectory || !supported.length) return installed
  const contents = await readDiscFiles(installed.path)
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
  log.info('install', 'created a disc playlist', {
    path: installed.path,
    discs: result.discs.length
  })
  return {
    ...installed,
    launchPath: join(installed.path, name),
    files: [...contents.map((file) => file.name), name].sort(),
    sizeBytes: installed.sizeBytes + Buffer.byteLength(body),
    playlist: { file: name, discs: result.discs }
  }
}
