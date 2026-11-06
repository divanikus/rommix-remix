/** Complete, normalized Linux snapshots; no device handles cross the bridge. */
export interface NativePad {
  index: number
  name: string
  buttons: boolean[]
  axes: number[]
}

export interface NativeGamepads {
  available: boolean
  pads: NativePad[]
}

export const NO_NATIVE_GAMEPADS: NativeGamepads = { available: false, pads: [] }

/** The helper is a process boundary, so reject malformed or unbounded input. */
export function parseNativeGamepads(value: unknown): NativeGamepads | null {
  if (!value || typeof value !== 'object') return null
  const snapshot = value as NativeGamepads
  if (typeof snapshot.available !== 'boolean' || !Array.isArray(snapshot.pads)) return null
  if (snapshot.pads.length > 32) return null
  const indices = new Set<number>()
  for (const pad of snapshot.pads) {
    if (!pad || !Number.isSafeInteger(pad.index) || pad.index < 0 || indices.has(pad.index))
      return null
    indices.add(pad.index)
    if (typeof pad.name !== 'string' || pad.name.length > 200) return null
    if (!Array.isArray(pad.buttons) || pad.buttons.length !== 17) return null
    if (!pad.buttons.every((button) => typeof button === 'boolean')) return null
    if (!Array.isArray(pad.axes) || pad.axes.length !== 2) return null
    if (!pad.axes.every((axis) => Number.isFinite(axis) && Math.abs(axis) <= 1)) return null
  }
  if (snapshot.available !== snapshot.pads.length > 0) return null
  return snapshot
}
