import type { RommPlatform } from '@shared/types'
import { titleLetter } from './library-letter'

export type SystemGrouping = 'none' | 'letter' | 'family' | 'category' | 'generation' | 'local'
export interface SystemsPresentation {
  layout: 'grid' | 'list'
  groupBy: SystemGrouping
  sort: 'name' | 'count'
  direction: 'asc' | 'desc'
}
const KEY = 'rommix.systems.presentation'
/** RomM uses non-positive values (notably -1) for unknown generations. */
export function platformGeneration(platform: Pick<RommPlatform, 'generation'>): number | null {
  const value = platform.generation
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}
export function readSystems(storage: Pick<Storage, 'getItem'>): SystemsPresentation {
  let value: Partial<SystemsPresentation> = {}
  try {
    value = JSON.parse(storage.getItem(KEY) ?? '{}') ?? {}
  } catch {
    /* Defaults. */
  }
  return {
    layout: value.layout === 'list' ? 'list' : 'grid',
    groupBy: ['letter', 'family', 'category', 'generation', 'local'].includes(value.groupBy ?? '')
      ? value.groupBy!
      : 'none',
    sort: value.sort === 'count' ? 'count' : 'name',
    direction: value.direction === 'desc' ? 'desc' : 'asc'
  }
}
export function writeSystems(storage: Pick<Storage, 'setItem'>, value: SystemsPresentation): void {
  try {
    storage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* Read-only profile. */
  }
}
export function groupSystems(
  items: RommPlatform[],
  preferences: SystemsPresentation,
  local: (p: RommPlatform) => number
): { key: string; items: RommPlatform[] }[] {
  const sign = preferences.direction === 'desc' ? -1 : 1
  const sorted = [...items].sort(
    (a, b) =>
      sign *
      ((preferences.sort === 'count' ? a.rom_count - b.rom_count : 0) ||
        a.display_name.localeCompare(b.display_name))
  )
  const groups = new Map<string, RommPlatform[]>()
  for (const p of sorted) {
    const key =
      preferences.groupBy === 'letter'
        ? titleLetter(p.display_name)
        : preferences.groupBy === 'family'
          ? (p.family_name ?? '')
          : preferences.groupBy === 'category'
            ? (p.category ?? '')
            : preferences.groupBy === 'generation'
              ? String(platformGeneration(p) ?? '')
              : preferences.groupBy === 'local'
                ? local(p) > 0
                  ? 'local'
                  : 'remote'
                : ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }
  return [...groups]
    .sort(([a], [b]) =>
      a === ''
        ? 1
        : b === ''
          ? -1
          : a.localeCompare(b, undefined, { numeric: true }) *
            (preferences.groupBy === 'generation' ? 1 : sign)
    )
    .map(([key, rows]) => ({ key, items: rows }))
}
