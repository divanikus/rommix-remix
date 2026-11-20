import { LEAVE_HOLD_MS } from '@shared/hold'
import type { NativeGamepads, NativePad } from '@shared/native-gamepad'

const START = 9
const GUIDE = 16

function used(pad: NativePad): boolean {
  return (
    pad.buttons.some((down, button) => down && button !== START && button !== GUIDE) ||
    pad.axes.some((axis) => Math.abs(axis) > 0.55)
  )
}

/**
 * EmulatorJS assigns the first controller it sees to player 1. Expose pads
 * as they are used so an idle Steam Input device cannot take that seat.
 * Keep the order when RomM reloads the document on entering an isolated core.
 */
export class PlayerNativeInput {
  private order: number[] = []
  private startSince = new Map<number, number>()
  private released = false
  private last = -Infinity

  pause(): void {
    this.released = false
    this.last = -Infinity
    this.startSince.clear()
  }

  read(state: NativeGamepads, now = performance.now()): { state: NativeGamepads; exit: boolean } {
    if (!state.available) {
      this.pause()
      return { state, exit: false }
    }
    if (now - this.last > 1000) this.pause()
    this.last = now
    if (!this.released) {
      // Ignore a button carried from the window that opened this player.
      this.released = state.pads.every((pad) => !pad.buttons.some(Boolean))
      if (!this.released) return { state: { available: true, pads: [] }, exit: false }
    }

    const byIndex = new Map(state.pads.map((pad) => [pad.index, pad]))
    this.order = this.order.filter((index) => byIndex.has(index))
    for (const pad of state.pads) {
      if (used(pad) && !this.order.includes(pad.index)) this.order.push(pad.index)
    }
    const pads = this.order.flatMap((index) => byIndex.get(index) ?? [])

    let exit = false
    const held = new Map<number, number>()
    for (const pad of state.pads) {
      if (!pad.buttons[START]) continue
      const since = this.startSince.get(pad.index) ?? now
      held.set(pad.index, since)
      if (now - since >= LEAVE_HOLD_MS) exit = true
    }
    this.startSince = held
    // Availability describes the input source. It may have no active pads yet.
    return { state: { available: true, pads }, exit }
  }
}
