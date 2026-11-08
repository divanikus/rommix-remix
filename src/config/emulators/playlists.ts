import type { LaunchVariant } from './types.ts'

/**
 * Verified runner capabilities, not a list of systems. Only formats whose
 * dependencies the disc-set reader understands are enabled for generation.
 * Sources: libretro-super/dist/info/<core>_libretro.info and Libretro's
 * disc-swapping guide; DuckStation's src/util/cd_image_m3u.cpp.
 */
const CORE_M3U: Readonly<Record<string, readonly string[]>> = {
  kronos: ['.cue', '.chd', '.iso'],
  mednafen_saturn: ['.cue', '.chd'],
  mednafen_psx: ['.cue', '.chd'],
  mednafen_psx_hw: ['.cue', '.chd'],
  pcsx_rearmed: ['.cue', '.chd', '.iso'],
  swanstation: ['.cue', '.chd', '.iso'],
  flycast: ['.cue', '.gdi', '.chd', '.cdi'],
  genesis_plus_gx: ['.cue', '.chd', '.iso']
}

export function coreM3u(core: string): readonly string[] | undefined {
  return CORE_M3U[core]
}

export const DUCKSTATION_M3U: readonly string[] = ['.cue', '.chd', '.iso']

/** Until a runner is chosen, only capabilities shared by every option are safe. */
export function m3uFormats(options: readonly LaunchVariant[], chosen?: string): readonly string[] {
  const selected = chosen ? options.filter((option) => option.id === chosen) : options
  if (!selected.length) return []
  return (selected[0].m3u ?? []).filter((extension) =>
    selected.every((option) => option.m3u?.includes(extension))
  )
}
