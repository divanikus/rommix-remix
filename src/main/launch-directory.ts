import { lstat, rename } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { InstallResult } from './install.ts'
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
    basename(installed.path) !== basename(name, extension) ||
    !(await lstat(installed.launchPath).catch(() => null))?.isFile()
  )
    return installed
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
