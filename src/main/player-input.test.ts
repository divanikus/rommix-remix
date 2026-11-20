import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { NativeGamepads, NativePad } from '@shared/native-gamepad'
import { PlayerNativeInput } from './player-input.ts'

const pad = (index: number, ...pressed: number[]): NativePad => ({
  index,
  name: `Pad ${index}`,
  buttons: Array.from({ length: 17 }, (_, button) => pressed.includes(button)),
  axes: [0, 0, 0, 0]
})

const state = (...pads: NativePad[]): NativeGamepads => ({ available: true, pads })

test('the first controller used in the player gets the first slot, ahead of idle pads', () => {
  const input = new PlayerNativeInput()
  const idle = pad(0)
  // This press opened the player in Remix and must not select a controller.
  assert.deepEqual(input.read(state(pad(0, 0), pad(3)), 0).state.pads, [])
  assert.deepEqual(input.read(state(idle, pad(3)), 100).state.pads, [])
  const active = pad(3, 0)
  assert.deepEqual(input.read(state(idle, active), 200).state.pads, [active])
  const second = pad(0, 12)
  assert.deepEqual(input.read(state(second, pad(3)), 300).state.pads, [pad(3), second])
  // Refocusing the same player does not reorder the controllers.
  input.pause()
  assert.deepEqual(input.read(state(idle, pad(3)), 500).state.pads, [pad(3), idle])
})

test('Start hold exits from the same controller, including one not assigned to the game', () => {
  const input = new PlayerNativeInput()
  input.read(state(pad(0), pad(3)), 0)
  for (const t of [200, 500, 800, 1100]) {
    assert.equal(input.read(state(pad(0, 9), pad(3)), t).exit, false)
  }
  for (const t of [1400, 1700, 2000, 2300, 2600]) {
    assert.equal(input.read(state(pad(0), pad(3, 9)), t).exit, false)
  }
  const held = input.read(state(pad(0), pad(3, 9)), 2900)
  assert.equal(held.exit, true)
  assert.deepEqual(held.state.pads, [])
  assert.equal(input.read(state(pad(0), pad(3, 9)), 4000).exit, false)
})
