import { lstat, rename } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { discPath, inspectDiscs } from '@shared/discs'
import { ROMSET_ARCHIVE_EXTENSIONS } from '@config/romfiles'
import type { InstallResult } from './install.ts'
import { readDiscFiles } from './disc-files.ts'
import { safeJoin } from './safepath.ts'
import { log } from './log.ts'

/** A fresh package can be one frontend entry without flattening its companions. */
export async function groupLaunchDirectory(
  installed: InstallResult,
  extensions: readonly string[]
): Promise<InstallResult> {
  const name = basename(installed.launchPath)
  const extension = extname(name)
  if (
    !installed.isDirectory ||
    !extensions.includes(extension.toLowerCase()) ||
    dirname(installed.launchPath) !== installed.path ||
    !(await lstat(installed.launchPath).catch(() => null))?.isFile()
  )
    return installed
  if (ROMSET_ARCHIVE_EXTENSIONS.includes(extension.toLowerCase())) {
    if (basename(installed.path) !== basename(name, extension)) return installed
  } else {
    const files = await readDiscFiles(installed.path)
    const playlists = files.filter((file) => /\.m3u8?$/i.test(file.name))
    if (playlists.length) {
      // A supplied playlist is authoritative. Preserve its bytes and order,
      // but only move it when its references stay valid inside this package.
      if (playlists.length !== 1 || playlists[0].name !== name || playlists[0].text === undefined)
        return installed
      const references = playlists[0].text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => (line.startsWith('./') ? line.slice(2) : line))
      if (
        !references.length ||
        references.some(
          (reference) =>
            !discPath(reference) ||
            reference === name ||
            !files.some((file) => file.name === reference)
        )
      )
        return installed
    } else {
      const inspected = inspectDiscs(files)
      // Never hide an unrecognised disc set behind whichever disc happened to
      // win the old launch fallback. A single disc needs no M3U-capable runner.
      if (
        inspected.state !== 'ready' ||
        inspected.discs.length !== 1 ||
        inspected.discs[0] !== name
      )
        return installed
    }
  }
  const target = await safeJoin(dirname(installed.path), name)
  if (!target || (await lstat(target).catch(() => null))) {
    log.info('install', 'launch directory already exists; keeping the downloaded layout', {
      path: target
    })
    return installed
  }
  await rename(installed.path, target)
  return { ...installed, path: target, launchPath: join(target, name) }
}
