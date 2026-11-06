import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import type { RomMixBridge } from '@shared/api'
import type { NativeGamepads } from '@shared/native-gamepad'
import { installDom } from '../test/dom.ts'

const dom = installDom()
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { useGamepad } = await import('./gamepad.ts')
const { acceptNativeGamepads, nativeGamepads } = await import('./native-gamepad.ts')
let cleanup = (): void => undefined
afterEach(() => cleanup())

function pad(pressed: number[] = [], index = 0): Gamepad {
  return {
    index,
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }))
  } as unknown as Gamepad
}

function harness(): {
  tick: (pressed?: number[]) => void
  focus: (value: boolean) => void
  suspend: (value: boolean) => void
  native: (state: NativeGamepads) => void
  actions: string[]
} {
  let callback: FrameRequestCallback = () => undefined
  let pads: Gamepad[] = []
  let focused = true
  let suspended = false
  let listener: ((state: NativeGamepads) => void) | null = null
  const actions: string[] = []
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (next: FrameRequestCallback) => {
      callback = next
      return 1
    }
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: () => undefined
  })
  Object.defineProperty(dom.navigator, 'getGamepads', { configurable: true, value: () => pads })
  dom.document.hasFocus = () => focused
  const bridge = {
    nativeGamepads: {
      current: async () => ({ available: false, pads: [] }),
      onState: (next: (state: NativeGamepads) => void) => {
        listener = next
        return () => {
          listener = null
        }
      }
    }
  }
  Object.defineProperty(dom, 'rommix', {
    configurable: true,
    value: bridge as unknown as RomMixBridge
  })
  const host = dom.document.createElement('div')
  const root = createRoot(host as unknown as HTMLElement)
  function Probe(): null {
    useGamepad(
      (d) => actions.push(d),
      (a) => actions.push(a),
      () => actions.push('activate'),
      () => undefined,
      suspended
    )
    return null
  }
  act(() => root.render(<Probe />))
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  return {
    actions,
    tick: (pressed = []) => {
      pads = [pad(pressed)]
      act(() => callback(performance.now()))
    },
    focus: (value) => {
      focused = value
    },
    suspend: (value) => {
      suspended = value
      act(() => root.render(<Probe />))
    },
    native: (state) => {
      listener?.(state)
    }
  }
}

test('quitting a game with A held never relaunches it; release rearms activation', () => {
  const h = harness()
  h.tick()
  h.suspend(true)
  h.tick([0])
  h.suspend(false)
  h.tick([0])
  assert.deepEqual(h.actions, [])
  h.tick()
  h.tick([0])
  assert.deepEqual(h.actions, ['activate'])
})

test('the final overlay press arriving only on the first focused frame is swallowed', () => {
  const h = harness()
  h.focus(false)
  h.tick()
  h.focus(true)
  h.tick([1, 15])
  assert.deepEqual(h.actions, [])
  h.tick()
  h.tick([1])
  assert.deepEqual(h.actions, ['back'])
})

test('a Chromium-silent controller drives the UI through native input without double actions', () => {
  const h = harness()
  const state = (pressed: number[]): NativeGamepads => ({
    available: true,
    pads: [
      { index: 0, name: 'silent virtual pad', buttons: Array(17).fill(false), axes: [0, 0] },
      {
        index: 1,
        name: 'active fixture pad',
        buttons: Array.from({ length: 17 }, (_, i) => pressed.includes(i)),
        axes: [0, 0]
      }
    ]
  })
  h.tick()
  h.native(state([]))
  h.tick()
  h.native(state([0]))
  h.tick()
  h.tick([0]) // Chromium surfaces the same held press later.
  assert.deepEqual(h.actions, ['activate'])
  h.native(state([]))
  h.tick([0]) // A stale Chromium copy is not merged back in.
  h.native(state([1]))
  h.tick()
  assert.deepEqual(h.actions, ['activate', 'back'])
  h.native({ available: false, pads: [] })
  h.tick([0]) // Changing backend adopts held state without activating.
  assert.deepEqual(h.actions, ['activate', 'back'])
  h.tick()
  h.tick([0])
  assert.deepEqual(h.actions, ['activate', 'back', 'activate'])
})

test('native stale state expires instead of holding a button forever', () => {
  acceptNativeGamepads(
    {
      available: true,
      pads: [{ index: 0, name: 'fixture', buttons: Array(17).fill(true), axes: [0, 0] }]
    },
    100
  )
  assert.equal(nativeGamepads(500)?.[0].buttons[0].pressed, true)
  assert.equal(nativeGamepads(1101), null)
})
