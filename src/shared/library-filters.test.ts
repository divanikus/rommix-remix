import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterCount, filterParams, parseDuration, validDuration } from './library-filters.ts'

test('filter wire format retains false, multiple values, punctuation and category logic', () => {
  const filters = {
    facets: {
      genres: { values: ['Action, adventure', 'RPG', 'RPG'], logic: 'all' as const },
      languages: { values: ['ja'], logic: 'none' as const }
    },
    flags: { favorite: false, physical: false, playable: true, has_soundtrack: true },
    duration: { minHours: 2, maxHours: 10 }
  }
  const params = filterParams(filters)
  assert.deepEqual(params.getAll('genres'), ['Action, adventure', 'RPG'])
  assert.equal(params.get('genres_logic'), 'all')
  assert.equal(params.get('languages_logic'), 'none')
  assert.equal(params.get('favorite'), 'false')
  assert.equal(params.get('hltb_main_story_min'), '7200')
  assert.equal(params.get('hltb_main_story_max'), '36000')
  assert.equal(filterCount(filters), 7)
  assert.equal(params.get('physical'), 'false')
  assert.equal(params.get('playable'), 'true')
  assert.equal(params.get('has_soundtrack'), 'true')
})
test('cleared values cannot leave an invisible exclusion or duration behind', () => {
  assert.equal(filterParams({ facets: { genres: { values: [], logic: 'none' } } }).size, 0)
  assert.equal(filterCount({ facets: { genres: { values: [], logic: 'none' } } }), 0)
  assert.equal(filterParams({ duration: { minHours: 30 } }).has('hltb_main_story_max'), false)
  assert.equal(filterParams().size, 0)
})

test('duration bounds accept decimals and open ends, and reject invalid or reversed values', () => {
  assert.deepEqual(parseDuration('1,5', ''), {
    valid: true,
    value: { minHours: 1.5, maxHours: undefined }
  })
  assert.deepEqual(parseDuration('', ''), { valid: true, value: undefined })
  for (const [min, max] of [
    ['-1', ''],
    ['10', '2'],
    ['bad', '3'],
    ['Infinity', '']
  ])
    assert.equal(parseDuration(min, max).valid, false)
  assert.equal(validDuration({ minHours: Number.NaN }), false)
  assert.equal(filterParams({ duration: { maxHours: 1.5 } }).get('hltb_main_story_max'), '5400')
  assert.equal(filterParams({ duration: { maxHours: 1.5 } }).has('hltb_main_story_min'), false)
})
