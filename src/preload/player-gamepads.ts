import type { NativePad } from '../shared/native-gamepad.ts'

/**
 * Runs in the EmulatorJS document's main world. Keep this function independent
 * of the preload's module scope so Electron can serialize it.
 */
export function installNativePlayerGamepads(): void {
  type Pad = {
    id: string
    index: number
    connected: boolean
    mapping: 'standard'
    timestamp: number
    axes: number[]
    buttons: { pressed: boolean; touched: boolean; value: number }[]
  }
  const page = globalThis as unknown as {
    navigator: { getGamepads(): (Pad | null)[] }
    rommixPlayerPads: { read(): NativePad[] | null }
    requestAnimationFrame(callback: (time: number) => void): void
    dispatchEvent(event: Event): void
    addEventListener(type: string, listener: (event: Event) => void, capture: boolean): void
  }
  const chromiumGetGamepads = page.navigator.getGamepads.bind(page.navigator)
  const slots: ({ nativeIndex: number; pad: Pad } | null)[] = []
  let usingNative = false
  page.navigator.getGamepads = () =>
    usingNative ? slots.map((slot) => slot?.pad ?? null) : chromiumGetGamepads()

  for (const type of ['gamepadconnected', 'gamepaddisconnected']) {
    page.addEventListener(
      type,
      (event) => {
        if (usingNative && event.isTrusted) event.stopImmediatePropagation()
      },
      true
    )
  }
  const announce = (type: string, pad: Pad): void => {
    const event = new Event(type)
    Object.defineProperty(event, 'gamepad', { value: pad })
    page.dispatchEvent(event)
  }

  const poll = (time: number): void => {
    const incoming = page.rommixPlayerPads.read()
    const wasNative = usingNative
    usingNative = incoming !== null
    const connected = incoming ?? []
    const indices = new Set(connected.map((pad) => pad.index))
    const removed: Pad[] = []
    const added: Pad[] = []
    slots.forEach((slot, index) => {
      if (!slot || indices.has(slot.nativeIndex)) return
      slots[index] = null
      slot.pad.connected = false
      removed.push(slot.pad)
    })
    for (const input of connected) {
      const slot = slots.find((one) => one?.nativeIndex === input.index)
      const hole = slots.indexOf(null)
      const index = slot?.pad.index ?? (hole < 0 ? slots.length : hole)
      const pad: Pad = {
        id: input.name,
        index,
        connected: true,
        mapping: 'standard',
        timestamp: time,
        axes: [input.axes[0], input.axes[1], input.axes[2] ?? 0, input.axes[3] ?? 0],
        buttons: input.buttons.map((pressed, button) => {
          const analog = button === 6 || button === 7 ? input.triggers?.[button - 6] : undefined
          const value = analog ?? (pressed ? 1 : 0)
          return { pressed, touched: value > 0, value }
        })
      }
      slots[index] = { nativeIndex: input.index, pad }
      if (!slot) added.push(pad)
    }
    for (const pad of removed) announce('gamepaddisconnected', pad)
    for (const pad of added) announce('gamepadconnected', pad)
    if (wasNative && !usingNative) {
      for (const pad of chromiumGetGamepads()) {
        if (pad?.connected) announce('gamepadconnected', pad)
      }
    }
    page.requestAnimationFrame(poll)
  }
  page.requestAnimationFrame(poll)
}
