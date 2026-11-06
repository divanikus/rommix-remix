import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceLetterRun, titleLetter } from './library-letter.ts'

test('letter hints preserve non-Latin initials and collect numbers/symbols under #', () => {
  assert.deepEqual([' king', 'Лада', 'écho', 'e\u0301cho', '007', '', '★game'].map(titleLetter), [
    'K',
    'Л',
    'É',
    'É',
    '#',
    '#',
    '#'
  ])
})

test('a letter glimpse needs sustained vertical travel and resets on pause, reversal or sideways', () => {
  let run = { time: 0, direction: '', length: 0 }
  for (const time of [0, 300, 600, 900]) run = advanceLetterRun(run, 'down', time)
  assert.equal(run.length, 1)
  for (const time of [990, 1080, 1170, 1260]) run = advanceLetterRun(run, 'down', time)
  assert.equal(run.length, 5)
  assert.equal(advanceLetterRun(run, 'up', 1350).length, 1)
  assert.equal(advanceLetterRun(run, 'right', 1350).length, 0)
  assert.equal(advanceLetterRun(run, 'down', 1700).length, 1)
})
