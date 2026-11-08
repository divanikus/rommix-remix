import { lstat, readFile } from 'node:fs/promises'
import { extname, relative } from 'node:path'
import type { DiscFile } from '@shared/discs'
import { filePathsUnder } from './install.ts'

/** Read small descriptors; never read a disc image just to decide its layout. */
export async function readDiscFiles(directory: string): Promise<DiscFile[]> {
  return Promise.all(
    (await filePathsUnder(directory)).map(async (path) => {
      const name = relative(directory, path).split('\\').join('/')
      const info = await lstat(path)
      const text =
        ['.m3u', '.m3u8', '.cue', '.gdi'].includes(extname(path).toLowerCase()) &&
        info.size <= 1024 * 1024
          ? await readFile(path, 'utf8')
          : undefined
      return { name, text }
    })
  )
}
