import assert from 'node:assert/strict'
import { test } from 'node:test'
import { letterTarget } from './library-letter.ts'

test('forward jumps wait for the next letter across pages; the final group clamps', () => {
  assert.equal(letterTarget(['Alpha', 'Another'], 0, 1, true), null)
  assert.equal(letterTarget(['Alpha', 'Another', 'Beta'], 0, 1, true), 2)
  assert.equal(letterTarget(['Alpha', 'Another'], 0, 1, false), 1)
})
test('backward goes to the start of this group, then the previous group', () => {
  const titles = ['123', 'Alpha', 'Another', 'Beta', 'Bravo']
  assert.equal(letterTarget(titles, 4, -1, true), 3)
  assert.equal(letterTarget(titles, 3, -1, true), 1)
  assert.equal(letterTarget(titles, 0, -1, true), 0)
})
test('display order, Unicode and # are shared with the letter glimpse', () => {
  const titles = ['Ярость', 'Яхта', 'Éclair', 'E\u0301cole', '123', '!game']
  assert.equal(letterTarget(titles, 0, 1, false), 2)
  assert.equal(letterTarget(titles, 2, 1, false), 4)
  assert.equal(letterTarget(titles, 4, -1, false), 2)
  assert.equal(letterTarget([], 0, 1, false), null)
})
