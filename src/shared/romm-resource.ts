/** RomM stores scraped video/fanart relative to FRONTEND_RESOURCES_PATH. */
export function romResourcePath(path: string | null | undefined): string | null {
  if (!path) return null
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
