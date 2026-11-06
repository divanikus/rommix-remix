import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { configureRemix } from './remix.ts'
import { configureInputProbe } from './input/probe.ts'

test('fork profile isolation keeps the existing input probe override and native-input opt-out', () => {
  const held = { ...process.env }
  const state = { name: 'RomMix', userData: '/config/rommix' }
  const app = {
    getPath: (key: 'home' | 'appData') => (key === 'home' ? '/user' : '/config'),
    setPath: (_key: 'userData', value: string) => {
      state.userData = value
    },
    setName: (value: string) => {
      state.name = value
    }
  }
  try {
    process.env.ROMMIX_NATIVE_GAMEPAD = '0'
    configureRemix(app)
    assert.equal(state.name, 'RomMix-Remix')
    assert.equal(state.userData, join('/config', 'rommix-remix'))
    assert.equal(process.env.ROMMIX_NATIVE_GAMEPAD, '0')
    process.env.ROMMIX_INPUT_PROBE = '1'
    configureInputProbe(app)
    assert.equal(state.name, 'RomMix Input Probe')
    assert.equal(state.userData, join('/config', 'rommix-input-probe'))
  } finally {
    for (const key of ['ROMMIX_NATIVE_GAMEPAD', 'ROMMIX_INPUT_PROBE', 'ROMMIX_HOME']) {
      if (held[key] === undefined) delete process.env[key]
      else process.env[key] = held[key]
    }
  }
})
