/** RomM query vocabulary; no metadata values or server state are persisted here. */
export const FACETS = [
  'genres',
  'player_counts',
  'languages',
  'regions',
  'statuses',
  'franchises',
  'collections',
  'publishers',
  'developers',
  'companies',
  'age_ratings',
  'tags'
] as const
export const FLAGS = [
  'favorite',
  'last_played',
  'has_saves',
  'has_states',
  'has_ra',
  'matched',
  'verified',
  'duplicate',
  'missing',
  'physical',
  'playable',
  'has_soundtrack'
] as const
export type Facet = (typeof FACETS)[number]
export type FilterFlag = (typeof FLAGS)[number]
export type FilterLogic = 'any' | 'all' | 'none'
export interface DurationFilter {
  minHours?: number
  maxHours?: number
}
export interface LibraryFilters {
  facets?: Partial<Record<Facet, { values: string[]; logic: FilterLogic }>>
  flags?: Partial<Record<FilterFlag, boolean>>
  duration?: DurationFilter
}
export interface FilterCatalog {
  supported: string[]
  values: Partial<Record<Facet, string[]>>
}
export function validDuration(range?: DurationFilter): boolean {
  if (!range) return true
  return (
    [range.minHours, range.maxHours].every(
      (v) =>
        v === undefined || (Number.isFinite(v) && v >= 0 && v * 3600 <= Number.MAX_SAFE_INTEGER)
    ) &&
    (range.minHours === undefined ||
      range.maxHours === undefined ||
      range.minHours <= range.maxHours)
  )
}
export function parseDuration(
  min: string,
  max: string
): { valid: boolean; value?: DurationFilter } {
  const parse = (text: string): number | undefined =>
    text.trim() ? Number(text.trim().replace(',', '.')) : undefined
  const value = { minHours: parse(min), maxHours: parse(max) }
  return {
    valid: validDuration(value),
    value: value.minHours === undefined && value.maxHours === undefined ? undefined : value
  }
}
export function filterCount(filters: LibraryFilters = {}): number {
  return (
    FACETS.filter((k) => filters.facets?.[k]?.values.length).length +
    FLAGS.filter((k) => filters.flags?.[k] !== undefined).length +
    (filters.duration?.minHours !== undefined || filters.duration?.maxHours !== undefined ? 1 : 0)
  )
}
/** Repeated parameters, never comma joined: values may themselves contain commas. */
export function filterParams(filters: LibraryFilters = {}): URLSearchParams {
  const params = new URLSearchParams()
  for (const facet of FACETS) {
    const selected = filters.facets?.[facet]
    if (!selected?.values.length) continue
    for (const value of [...new Set(selected.values)].sort()) params.append(facet, value)
    if (selected.logic !== 'any') params.set(`${facet}_logic`, selected.logic)
  }
  for (const flag of FLAGS) {
    if (typeof filters.flags?.[flag] === 'boolean') params.set(flag, String(filters.flags[flag]))
  }
  if (filters.duration && validDuration(filters.duration)) {
    const { minHours, maxHours } = filters.duration
    if (minHours !== undefined)
      params.set('hltb_main_story_min', String(Math.round(minHours * 3600)))
    if (maxHours !== undefined)
      params.set('hltb_main_story_max', String(Math.round(maxHours * 3600)))
  }
  return params
}
