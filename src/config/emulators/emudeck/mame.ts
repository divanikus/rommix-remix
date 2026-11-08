import { joinPath } from '../savepaths.ts'
import type { LaunchContext } from '../types.ts'

/**
 * EmuDeck's mame.sh forwards argv unchanged. A full ZIP path identifies the
 * machine in MAME, but does not add its parent to the ROM search path.
 * Keep configured BIOS/parent locations alongside the downloaded set.
 */
export function mameArguments(ctx: LaunchContext): string[] | null {
  if (!/\.(zip|7z)$/i.test(ctx.romPath)) return null
  const folder = ctx.romPath.slice(0, ctx.romPath.lastIndexOf('/'))
  // MAME splits rompath on semicolons; there is no escaping a literal one.
  if (!folder || folder.includes(';')) return null
  const text = ctx.env.text(joinPath(ctx.home, '.mame', 'mame.ini'))
  let configured: string | undefined
  for (const line of text?.split(/\r?\n/) ?? []) {
    const match = /^\s*rompath\s+(?:"([^"]*)"|([^#]*))/i.exec(line)
    if (match) configured = (match[1] ?? match[2]).trim()
  }
  const fallback = [
    ctx.paths.roms && joinPath(ctx.paths.roms, ctx.system),
    ctx.paths.roms && joinPath(ctx.paths.roms, 'arcade'),
    ctx.paths.bios,
    ctx.paths.bios && joinPath(ctx.paths.bios, 'mame')
  ].filter((path): path is string => !!path)
  const paths = [folder, ...(configured !== undefined ? configured.split(';') : fallback)]
  return ['-rompath', [...new Set(paths.filter(Boolean))].join(';'), ctx.romPath]
}
