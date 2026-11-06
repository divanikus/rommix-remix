/** Keep non-Latin titles useful too; numeric/symbol-leading titles share '#'. */
export function titleLetter(title: string): string {
  const first = Array.from(title.trim().normalize('NFC'))[0] ?? ''
  return /\p{L}/u.test(first) ? first.toLocaleUpperCase() : '#'
}

/** In display order, independent of A–Z/Z–A. Null asks for another server page. */
export function letterTarget(
  titles: readonly string[],
  index: number,
  direction: -1 | 1,
  more: boolean
): number | null {
  if (!titles.length || index < 0 || index >= titles.length) return null
  const letter = titleLetter(titles[index])
  if (direction === 1) {
    for (let next = index + 1; next < titles.length; next++) {
      if (titleLetter(titles[next]) !== letter) return next
    }
    return more ? null : titles.length - 1
  }
  let first = index
  while (first > 0 && titleLetter(titles[first - 1]) === letter) first--
  if (first < index || first === 0) return first
  const previous = titleLetter(titles[first - 1])
  do {
    first--
  } while (first > 0 && titleLetter(titles[first - 1]) === previous)
  return first
}

export interface LetterRun {
  time: number
  direction: string
  length: number
}
export function advanceLetterRun(previous: LetterRun, direction: string, time: number): LetterRun {
  const vertical = direction === 'up' || direction === 'down'
  return {
    time,
    direction,
    length: !vertical
      ? 0
      : previous.direction === direction && time - previous.time < 200
        ? previous.length + 1
        : 1
  }
}
