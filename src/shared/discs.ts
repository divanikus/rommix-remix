import { DISC_EXTENSIONS, DISC_SIDECAR_EXTENSIONS } from '../config/romfiles.ts'

/** Pure disc-set recognition. No platform, emulator or filesystem assumptions. */
export interface DiscFile {
  name: string
  /** Text only for small CUE/GDI descriptors. Images are never read into memory. */
  text?: string
}

export type DiscSet =
  | { state: 'ready'; discs: string[] }
  | { state: 'skip'; reason: 'playlist' | 'single' | 'ambiguous' | 'unsupported' | 'incomplete' }

const extension = (name: string): string => name.slice(name.lastIndexOf('.')).toLowerCase()

/** A relative file path representable as one ordinary M3U line. */
export function discPath(name: string): boolean {
  return (
    !!name &&
    !/[\r\n\0\\:]/.test(name) &&
    !name.startsWith('/') &&
    !name.startsWith('#') &&
    name.trim() === name &&
    name.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  )
}

/** Resolve a descriptor's relative reference while retaining exact filename case. */
function referencedBy(name: string, reference: string): string | null {
  if (!discPath(reference)) return null
  const slash = name.lastIndexOf('/')
  return (slash < 0 ? '' : name.slice(0, slash + 1)) + reference
}

function tracks(file: DiscFile): string[] | null {
  if (file.text === undefined) return null
  if (extension(file.name) === '.cue') {
    const lines = file.text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => /^\s*FILE\b/i.test(line))
    if (!lines.length) return null
    const parsed = lines.map((line) => /^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+\S+\s*$/i.exec(line))
    if (parsed.some((match) => !match)) return null
    return parsed.map((match) => match![1] ?? match![2])
  }
  const lines = file.text.trim().split(/\r?\n/)
  const count = Number(lines.shift())
  if (!Number.isInteger(count) || count < 1 || count !== lines.length) return null
  const parsed = lines.map((line) =>
    /^\s*\d+\s+\d+\s+\d+\s+\d+\s+(?:"([^"]+)"|(\S+))\s+\d+\s*$/.exec(line)
  )
  if (parsed.some((match) => !match)) return null
  return parsed.map((match) => match![1] ?? match![2])
}

/** Disc numbers must agree in both filenames and enclosing Disc N folders. */
function numbered(name: string): { number: number; family: string; total?: number } | null {
  const stem = name.slice(0, -extension(name).length)
  const pattern = /\b(?:disc|disk|cd)[ _.-]*(\d+)(?:\s+of\s+(\d+))?\b/gi
  const marks = [...stem.matchAll(pattern)]
  if (!marks.length || marks.some((mark) => Number(mark[1]) !== Number(marks[0][1]))) return null
  const totals = marks.filter((mark) => mark[2]).map((mark) => Number(mark[2]))
  if (totals.some((total) => total !== totals[0])) return null
  return {
    number: Number(marks[0][1]),
    family: stem.replace(pattern, 'disc').toLowerCase(),
    total: totals[0]
  }
}

export function recognizeDiscs(files: readonly DiscFile[], supported: readonly string[]): DiscSet {
  if (files.some((file) => /\.m3u8?$/i.test(file.name)))
    return { state: 'skip', reason: 'playlist' }
  const candidates = files.filter((file) => DISC_EXTENSIONS.includes(extension(file.name)))
  if (candidates.length < 2) return { state: 'skip', reason: 'single' }
  if (files.some((file) => !discPath(file.name))) return { state: 'skip', reason: 'ambiguous' }
  // ZIP/BIOS/CHD combinations and executable/update bundles are not disc sets.
  const names = new Set(files.map((file) => file.name))
  const used = new Set<string>()
  for (const file of candidates.filter((candidate) =>
    ['.cue', '.gdi'].includes(extension(candidate.name))
  )) {
    const references = tracks(file)?.map((track) => referencedBy(file.name, track))
    if (!references?.length || references.some((track) => !track || !names.has(track)))
      return { state: 'skip', reason: 'incomplete' }
    if (references.some((track) => used.has(track!) || /\.(cue|gdi|chd)$/i.test(track!)))
      return { state: 'skip', reason: 'ambiguous' }
    references.forEach((track) => used.add(track!))
  }
  const discs = candidates.filter((file) => !used.has(file.name))
  if (discs.length < 2) return { state: 'skip', reason: 'single' }
  if (discs.some((file) => !supported.includes(extension(file.name))))
    return { state: 'skip', reason: 'unsupported' }
  // Anything beyond discs, their tracks and descriptive sidecars needs its own interpretation.
  if (
    files.some(
      (file) =>
        !discs.includes(file) &&
        !used.has(file.name) &&
        !DISC_SIDECAR_EXTENSIONS.includes(extension(file.name))
    )
  )
    return { state: 'skip', reason: 'ambiguous' }
  const ordered = discs.map((file) => ({ file, order: numbered(file.name) }))
  if (ordered.some(({ order }) => !order)) return { state: 'skip', reason: 'ambiguous' }
  ordered.sort((a, b) => a.order!.number - b.order!.number)
  if (
    ordered.some(
      ({ order }, index) =>
        order!.number !== index + 1 ||
        order!.family !== ordered[0].order!.family ||
        (order!.total !== undefined && order!.total !== ordered.length)
    )
  )
    return { state: 'skip', reason: 'ambiguous' }
  return { state: 'ready', discs: ordered.map(({ file }) => file.name) }
}
