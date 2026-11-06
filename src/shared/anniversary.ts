/** RomM release dates are UTC milliseconds; the viewing day is a local calendar day. */
export function anniversaryDay(day: string): { year: number; month: number; date: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const [year, month, date] = match.slice(1).map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, date))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== date
  )
    return null
  // Year-only metadata commonly uses January 1: do not invent anniversaries.
  if (month === 1 && date === 1) return null
  return { year, month, date }
}
export function isAnniversary(release: number | null | undefined, day: string): boolean {
  const target = anniversaryDay(day)
  if (!target || !release || !Number.isFinite(release)) return false
  const date = new Date(release)
  return (
    date.getUTCFullYear() < target.year &&
    date.getUTCMonth() + 1 === target.month &&
    date.getUTCDate() === target.date
  )
}
