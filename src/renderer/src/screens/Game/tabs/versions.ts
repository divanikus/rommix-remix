import type { RomQuery, RommRom, RommSiblingRom } from '@shared/types'

type VersionName = Pick<RommSiblingRom, 'id' | 'name' | 'fs_name_no_ext'>

/**
 * Metadata names help distinguish short ROM names when the server gives each
 * version its own title. A shared title adds nothing to the choice, so those
 * groups keep filenames, including their region, revision and translation tags.
 * Keep the filename visible even when the metadata supplies the main label.
 */
export function versionRows(rom: VersionName, siblings: readonly VersionName[]) {
  const versions = [rom, ...siblings]
  const normalize = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase()
  const names = new Set(versions.map((row) => normalize(row.name ?? '')).filter(Boolean))
  return (
    versions
      .map((row) => {
        const title = (names.size > 1 && row.name?.trim()) || row.fs_name_no_ext
        return {
          id: row.id,
          fsNameNoExt: row.fs_name_no_ext,
          title,
          filename: normalize(title) === normalize(row.fs_name_no_ext) ? null : row.fs_name_no_ext
        }
      })
      // Metadata loading and selecting another version must not reshuffle rows.
      .sort((one, other) => one.fsNameNoExt.localeCompare(other.fsNameNoExt))
  )
}

/**
 * Which version stands for a game, and who chose it.
 *
 * The version a grouped grid shows and opens is either the one this user
 * marked in RomM or, with none marked, the one RomM picks by its own order.
 * The mark is on every row; RomM's pick is on none, so it is asked for the way
 * the grid asks and found among what comes back. Kept out of the tab so it can
 * be tested without a screen. See `VersionsTab`.
 */

/** The version this user marked in RomM, if any. */
export function markedVersion(
  rom: RommRom,
  siblings: readonly RommSiblingRom[]
): number | undefined {
  if (rom.rom_user.is_main_sibling) return rom.id
  return siblings.find((sibling) => sibling.is_main_sibling)?.id
}

/**
 * The grouped list that has RomM's pick for this game in it.
 *
 * Narrowed by name: every version of a game shares the name its metadata gives
 * it, so the search keeps the whole group and the grouping still has all of
 * them to choose from.
 */
export function pickQuery(rom: RommRom): RomQuery {
  return {
    group_by_meta_id: true,
    platform_ids: [rom.platform_id],
    search_term: rom.name ?? rom.fs_name_no_tags
  }
}

/** The version of this game a grouped list returned, if it returned one. */
export function pickedVersion(
  items: readonly Pick<RommRom, 'id'>[],
  rom: RommRom,
  siblings: readonly RommSiblingRom[]
): number | null {
  const group = new Set([rom.id, ...siblings.map((sibling) => sibling.id)])
  return items.find((item) => group.has(item.id))?.id ?? null
}
