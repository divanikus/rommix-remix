import type { NativeGamepads } from '@shared/native-gamepad'

let snapshot: NativeGamepads | null = null
let received = -Infinity

export function acceptNativeGamepads(state: NativeGamepads, now = performance.now()): void {
  snapshot = state
  received = now
}

/** One authoritative backend at a time avoids Chromium/native duplicate taps. */
export function nativeGamepads(now = performance.now()): Gamepad[] | null {
  if (!snapshot?.available || now - received > 1000) return null
  return snapshot.pads.map(
    (pad) =>
      ({
        id: `${pad.name} (Linux native)`,
        index: pad.index,
        connected: true,
        mapping: 'standard',
        timestamp: received,
        axes: pad.axes,
        buttons: pad.buttons.map((pressed) => ({
          pressed,
          touched: pressed,
          value: pressed ? 1 : 0
        })),
        vibrationActuator: null
      }) as unknown as Gamepad
  )
}
