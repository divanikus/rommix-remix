import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseNativeGamepads, NO_NATIVE_GAMEPADS } from './native-gamepad.ts'

const pad = { index: 0, name: 'fixture', buttons: Array(17).fill(false), axes: [0, 0] }

test('native snapshots validate complete frames and unavailable state', () => {
  assert.deepEqual(parseNativeGamepads(NO_NATIVE_GAMEPADS), NO_NATIVE_GAMEPADS)
  const state = { available: true, pads: [pad] }
  assert.deepEqual(parseNativeGamepads(state), state)
  for (const invalid of [
    null,
    {},
    { available: true, pads: [] },
    { available: false, pads: [pad] },
    { available: true, pads: [pad, pad] },
    ...[
      { axes: [NaN, 0] },
      { axes: [2, 0] },
      { index: -1 },
      { buttons: [true] },
      { buttons: Array(17).fill(1) },
      { name: 'x'.repeat(201) }
    ].map((value) => ({ available: true, pads: [{ ...pad, ...value }] }))
  ])
    assert.equal(parseNativeGamepads(invalid), null)
})
