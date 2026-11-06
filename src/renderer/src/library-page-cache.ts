import type { RommRomPage, RomQuery } from '@shared/types'

/** Short-lived first-page metadata only. Owned by one mounted library screen. */
export function createLibraryPageCache(
  fetchPage: (query: RomQuery) => Promise<RommRomPage>,
  pageSize: number,
  now: () => number = Date.now
): {
  peek: (query: RomQuery) => RommRomPage | undefined
  read: (query: RomQuery) => Promise<RommRomPage>
  clear: () => void
} {
  const pages = new Map<string, { page: RommRomPage; expires: number }>()
  const pending = new Map<string, Promise<RommRomPage>>()
  let generation = 0
  const keyOf = (query: RomQuery): string =>
    JSON.stringify(Object.fromEntries(Object.entries(query).sort(([a], [b]) => a.localeCompare(b))))
  const cacheable = (query: RomQuery): boolean =>
    (query.offset ?? 0) === 0 && query.limit === pageSize
  const peek = (query: RomQuery): RommRomPage | undefined => {
    if (!cacheable(query)) return
    const key = keyOf(query),
      hit = pages.get(key)
    if (hit && hit.expires > now()) return hit.page
    pages.delete(key)
    return undefined
  }
  const read = (query: RomQuery): Promise<RommRomPage> => {
    if (!cacheable(query)) return fetchPage(query)
    const key = keyOf(query),
      hit = peek(query)
    if (hit) return Promise.resolve(hit)
    const outstanding = pending.get(key)
    if (outstanding) return outstanding
    const mine = generation
    const request = fetchPage(query)
      .then((page) => {
        if (mine !== generation) return page
        pages.delete(key)
        pages.set(key, { page, expires: now() + 30_000 })
        while (pages.size > 5) pages.delete(pages.keys().next().value as string)
        return page
      })
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key)
      })
    pending.set(key, request)
    return request
  }
  return {
    peek,
    read,
    clear: () => {
      generation++
      pages.clear()
      pending.clear()
    }
  }
}
