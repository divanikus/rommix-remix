/** RomM stores scraped video/fanart relative to FRONTEND_RESOURCES_PATH. */
export function romResourcePath(path: string | null | undefined): string | null {
  if (!path) return null
  // RomM cover URLs carry a cache timestamp. It is not part of the asset filename.
  // Strip only this known parameter; keep rejecting redirect/arbitrary queries.
  const queryAt = path.indexOf('?')
  if (queryAt !== -1) {
    const query = new URLSearchParams(path.slice(queryAt + 1))
    const timestamp = query.get('ts')
    if (query.size !== 1 || !timestamp || !/^[0-9TtZz: .+-]{1,80}$/.test(timestamp)) return null
    path = path.slice(0, queryAt)
  }
  const rooted = path.startsWith('roms/') ? `/assets/romm/resources/${path}` : path
  if (!rooted.startsWith('/assets/romm/resources/')) return null
  try {
    const decoded = decodeURIComponent(rooted)
    if (decoded.includes('..') || /[\\?#]/.test(decoded)) return null
  } catch {
    return null
  }
  return rooted
}
