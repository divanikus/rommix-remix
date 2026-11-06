import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uiScaleFor } from './ui-scale.ts'

test('automatic couch scale preserves an 900px design across common displays', () => {
  for (const height of [720, 900, 1080, 1440, 2160]) assert.equal(height / uiScaleFor(height), 900)
  assert.equal(uiScaleFor(1080), 1.2) // also 4K with 200% compositor scaling
  assert.equal(uiScaleFor(0), 1)
  assert.equal(uiScaleFor(400), 0.75)
  assert.equal(uiScaleFor(4000), 3)
})
test('explicit UI size remains independent of the window', () => {
  assert.equal(uiScaleFor(2160, 1), 1)
  assert.equal(uiScaleFor(800, 1.6), 1.5)
})
