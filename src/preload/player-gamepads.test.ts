import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { NativePad } from '../shared/native-gamepad.ts'
import { installNativePlayerGamepads } from './player-gamepads.ts'

test('the player receives native buttons and can return to Chromium input', () => {
  const pad = (index: number, pressed = false): NativePad => ({
    index,
    name: `Pad ${index}`,
    axes: [0.5, -0.25],
    buttons: Array.from({ length: 17 }, (_, button) => button === 0 && pressed)
  })
  const chromium = [
    {
      index: 0,
      id: 'Chromium pad',
      connected: true,
      axes: [],
      buttons: [] as { pressed: boolean }[]
    }
  ]
  let snapshot: NativePad[] | null = null
  const frames: ((now: number) => void)[] = []
  const events: [string, number][] = []
  const navigator = { getGamepads: () => chromium }
  const globals = {
    navigator,
    rommixPlayerPads: { read: () => snapshot },
    requestAnimationFrame: (callback: (now: number) => void) => frames.push(callback),
    dispatchEvent: (event: Event & { gamepad: { index: number } }) =>
      events.push([event.type, event.gamepad.index]),
    addEventListener: () => undefined
  }
  const old = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  )
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true })
  }
  try {
    installNativePlayerGamepads()
    assert.equal(navigator.getGamepads(), chromium)
    snapshot = [pad(41), pad(68, true)]
    frames.shift()!(1)
    const devices = navigator.getGamepads()
    assert.deepEqual(
      devices.map(({ index, id }) => [index, id]),
      [
        [0, 'Pad 41'],
        [1, 'Pad 68']
      ]
    )
    assert.deepEqual(
      { axes: devices[1].axes, button: devices[1].buttons[0] },
      { axes: [0.5, -0.25, 0, 0], button: { pressed: true, touched: true, value: 1 } }
    )
    assert.deepEqual(events, [
      ['gamepadconnected', 0],
      ['gamepadconnected', 1]
    ])
    snapshot = [pad(68)]
    frames.shift()!(2)
    assert.equal(navigator.getGamepads()[0], null)
    assert.equal(navigator.getGamepads()[1].id, devices[1].id)
    assert.equal(navigator.getGamepads()[1].buttons[0].pressed, false)
    assert.equal(devices[1].buttons[0].pressed, true)
    assert.deepEqual(events.at(-1), ['gamepaddisconnected', 0])
    snapshot = null
    frames.shift()!(3)
    assert.equal(navigator.getGamepads(), chromium)
    assert.deepEqual(events.slice(-2), [
      ['gamepaddisconnected', 1],
      ['gamepadconnected', 0]
    ])
  } finally {
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
