import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { configureInputProbe } from './probe.ts'

test('probe isolates its profile and library root without changing emulator configuration roots', () => {
  const keys = [
    'ROMMIX_INPUT_PROBE',
    'ROMMIX_HOME',
    'ROMMIX_NATIVE_GAMEPAD',
    'XDG_DATA_HOME',
    'XDG_CONFIG_HOME'
  ] as const
  const before = new Map(keys.map((key) => [key, process.env[key]]))
  const calls: string[] = []
  const app = {
    getPath: (name: 'home' | 'appData') => (name === 'home' ? '/fixture-home' : '/fixture-config'),
    setName: (value: string) => {
      calls.push(value)
    },
    setPath: (_name: 'userData', value: string) => {
      calls.push(value)
    }
  }
  try {
    delete process.env.ROMMIX_INPUT_PROBE
    configureInputProbe(app)
    assert.deepEqual(calls, [])
    process.env.ROMMIX_INPUT_PROBE = '1'
    process.env.ROMMIX_HOME = '/stock-root'
    process.env.XDG_DATA_HOME = '/fixture-data'
    process.env.XDG_CONFIG_HOME = '/fixture-config'
    delete process.env.ROMMIX_NATIVE_GAMEPAD
    configureInputProbe(app)
    assert.deepEqual(calls, ['RomMix Input Probe', join('/fixture-config', 'rommix-input-probe')])
    assert.equal(process.env.ROMMIX_HOME, join('/fixture-data', 'rommix-input-probe'))
    assert.equal(process.env.XDG_CONFIG_HOME, '/fixture-config')
    assert.equal(process.env.ROMMIX_NATIVE_GAMEPAD, '1')
    process.env.ROMMIX_NATIVE_GAMEPAD = '0'
    configureInputProbe(app)
    assert.equal(process.env.ROMMIX_NATIVE_GAMEPAD, '0')
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
