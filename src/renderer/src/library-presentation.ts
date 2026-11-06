export type LibraryLayout = 'grid' | 'list'
export type CoverSize = 'small' | 'medium' | 'large'
export interface LibraryPresentation {
  layout: LibraryLayout
  coverSize: CoverSize
  groupBy: 'none' | 'letter'
  sortDir: 'asc' | 'desc'
}

const KEY = 'rommix.library.presentation'
const DEFAULTS: LibraryPresentation = {
  layout: 'grid',
  coverSize: 'medium',
  groupBy: 'none',
  sortDir: 'asc'
}

/** Presentation only: no server identity, credentials or library inventory. */
export function readPresentation(storage: Pick<Storage, 'getItem'>): LibraryPresentation {
  try {
    const value = JSON.parse(storage.getItem(KEY) ?? 'null')
    return {
      layout: value?.layout === 'list' ? 'list' : 'grid',
      coverSize:
        value?.coverSize === 'compact'
          ? 'small'
          : ['small', 'medium', 'large'].includes(value?.coverSize)
            ? value.coverSize
            : 'medium',
      groupBy: value?.groupBy === 'letter' ? 'letter' : 'none',
      sortDir: value?.sortDir === 'desc' ? 'desc' : 'asc'
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writePresentation(
  storage: Pick<Storage, 'setItem'>,
  value: LibraryPresentation
): void {
  try {
    storage.setItem(KEY, JSON.stringify(value))
  } catch {
    // A read-only/full profile must not prevent changing the current view.
  }
}
