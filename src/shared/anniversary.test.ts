import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anniversaryDay, isAnniversary } from './anniversary.ts'
test('anniversaries use real UTC release dates and the local calendar day, not the current year', () => {
  assert.equal(isAnniversary(Date.UTC(2000, 10, 5), '2026-11-05'), true)
  assert.equal(isAnniversary(Date.UTC(2000, 10, 4, 23), '2026-11-05'), false)
  assert.equal(isAnniversary(Date.UTC(2026, 10, 5), '2026-11-05'), false)
  assert.equal(isAnniversary(null, '2026-11-05'), false)
})
test('anniversaries reject invalid dates and year-only January 1 metadata', () => {
  assert.equal(anniversaryDay('2026-02-29'), null)
  assert.equal(anniversaryDay('2026-01-01'), null)
  assert.deepEqual(anniversaryDay('2028-02-29'), { year: 2028, month: 2, date: 29 })
})
