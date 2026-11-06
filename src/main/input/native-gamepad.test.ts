import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { test } from 'node:test'
import { watchNativeGamepads } from './native-gamepad.ts'
import type { NativeGamepads } from '../../shared/native-gamepad.ts'

const down = {
  available: true,
  pads: [{ index: 0, name: 'fixture', buttons: Array(17).fill(true), axes: [0, 0] }]
}

function harness(): {
  child: EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough }
  states: NativeGamepads[]
  killed: () => number
  stop: () => void
} {
  let killed = 0
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => {
      killed++
      return true
    }
  })
  const states: NativeGamepads[] = []
  const reader = watchNativeGamepads(
    child as unknown as ChildProcessWithoutNullStreams,
    (state) => states.push(state),
    () => undefined
  )
  return { child, states, killed: () => killed, stop: reader.stop }
}

test('split protocol frames are reassembled and exit clears held input', () => {
  const h = harness()
  try {
    const line = JSON.stringify(down) + '\n'
    h.child.stdout.write(line.slice(0, 15))
    assert.equal(h.states.length, 0)
    h.child.stdout.write(line.slice(15))
    assert.deepEqual(h.states.at(-1), down)
    h.child.emit('exit', 1)
    assert.deepEqual(h.states.at(-1), { available: false, pads: [] })
    assert.equal(h.killed(), 1)
  } finally {
    h.stop()
  }
})

test('malformed or oversized helper output falls back and stops the helper', () => {
  for (const data of ['not json\n', '{"available":true,"pads":[]}\n', 'x'.repeat(65537)]) {
    const h = harness()
    try {
      h.child.stdout.write(JSON.stringify(down) + '\n')
      h.child.stdout.write(data)
      assert.deepEqual(h.states.at(-1), { available: false, pads: [] })
      assert.equal(h.killed(), 1)
    } finally {
      h.stop()
    }
  }
})

test('helper timeout drops stale held input; shutdown is idempotent', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] })
  const h = harness()
  try {
    h.child.stdout.write(JSON.stringify(down) + '\n')
    t.mock.timers.tick(1250)
    assert.deepEqual(h.states.at(-1), { available: false, pads: [] })
    h.stop()
    assert.equal(h.killed(), 1)
    assert.ok(h.child.stdin.writableEnded)
  } finally {
    h.stop()
  }
})

test('missing Python and a closed parent pipe degrade without an uncaught error', () => {
  for (const stream of ['child', 'stdin'] as const) {
    const h = harness()
    try {
      ;(stream === 'child' ? h.child : h.child.stdin).emit('error', new Error('fixture'))
      assert.deepEqual(h.states.at(-1), { available: false, pads: [] })
      assert.equal(h.killed(), 1)
    } finally {
      h.stop()
    }
  }
})
