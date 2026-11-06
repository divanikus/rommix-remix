import assert from 'node:assert/strict'
import { test } from 'node:test'
import { app } from 'electron'
import { Updater } from '../update.ts'
import type { Store } from '../store.ts'

test('probe refuses scheduled/manual updates, launcher replacement and restart before any work', async (t) => {
  const previous = process.env.ROMMIX_INPUT_PROBE
  process.env.ROMMIX_INPUT_PROBE = '1'
  t.mock.method(app, 'getVersion', () => '0.23.0')
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('unexpected network request')
  })
  const store = {
    get settings() {
      throw new Error('unexpected update policy access')
    }
  } as unknown as Store
  let closed = false
  try {
    const updater = new Updater(store, () => undefined)
    assert.ok(updater.status.blockedReason)
    updater.schedule()
    await updater.refreshSteamLauncher()
    assert.equal(await updater.check(), updater.status)
    assert.equal(await updater.download(), updater.status)
    await assert.rejects(
      updater.restart(async () => {
        closed = true
      })
    )
    assert.equal(closed, false)
    updater.stop()
  } finally {
    if (previous === undefined) delete process.env.ROMMIX_INPUT_PROBE
    else process.env.ROMMIX_INPUT_PROBE = previous
  }
})
