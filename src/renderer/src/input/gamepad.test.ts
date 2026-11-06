import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readPads } from './gamepad.ts'

/**
 * What the poll sees, with every connected pad folded into one.
 *
 * Pure, so it needs no window and no Gamepad API: a pad here is the shape
 * Chromium hands back, built by hand. The loop around it is timing and
 * dispatch and is covered by `test/app/`.
 */

/** A pad in slot `index` with the given buttons down and its axes where they are put. */
function pad(
  index: number,
  pressed: number[] = [],
  axes: number[] = [0, 0, 0, 0],
  mapping: GamepadMappingType = 'standard'
): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, slot) => ({
    pressed: pressed.includes(slot),
    touched: pressed.includes(slot),
    value: pressed.includes(slot) ? 1 : 0
  }))
  return { index, buttons, axes, mapping } as unknown as Gamepad
}

describe('reading every pad', () => {
  test('standard triggers and Select are distinct from Start; raw legacy slots are not guessed', () => {
    assert.deepEqual([...readPads([pad(0, [6, 7, 8])], null).buttons], ['lt', 'rt', 'select'])
    const legacy = readPads([pad(0, [6, 7, 8], [0, 0], '')], null)
    assert.deepEqual([...legacy.buttons], ['start'])
    assert.equal(legacy.guide, true)
  })
  test('a press on a pad past the first slot is seen', () => {
    // Chromium numbers pads by when they arrived, so the one being used can
    // be in any slot.
    const { buttons } = readPads([pad(0), null, pad(2, [0])], null)
    assert.ok(buttons.has('a'))
  })

  test('the same control held on two pads is one control', () => {
    const { buttons } = readPads([pad(0, [0]), pad(1, [0])], null)
    assert.deepEqual([...buttons], ['a'])
  })

  test('nothing connected reads as nothing held', () => {
    const { buttons, sticks, active } = readPads([null, null, null, null], 0)
    assert.equal(buttons.size, 0)
    assert.equal(sticks.size, 0)
    assert.equal(active, null)
  })
})

describe('the guide button', () => {
  test('is seen from any pad, and is never a control', () => {
    const { buttons, guide } = readPads([pad(0), pad(1, [16, 2])], null)
    assert.ok(guide)
    assert.deepEqual([...buttons], ['x'])
  })

  test('on a mapped pad, button 8 is Back, not the guide button', () => {
    assert.ok(!readPads([pad(0, [8])], null).guide)
  })
})

describe('the active pad', () => {
  test('is the one that pressed a button', () => {
    assert.equal(readPads([pad(0), pad(1, [0])], null).active, 1)
  })

  test('stays active once its buttons are released', () => {
    assert.equal(readPads([pad(0), pad(1)], 1).active, 1)
  })

  test('keeps the role while pressing, whatever else is pressed', () => {
    assert.equal(readPads([pad(0, [0]), pad(1, [1])], 1).active, 1)
  })

  test('hands over to another pad that presses a button', () => {
    assert.equal(readPads([pad(0, [0]), pad(1)], 1).active, 0)
  })

  test('among several, is nobody until a button is pressed', () => {
    assert.equal(readPads([pad(0, [], [1, 1, 0, 0]), pad(1)], null).active, null)
  })

  test('is the one whose stick is pushed out of the dead zone', () => {
    // With more than one pad connected, the stick must still work before any
    // button is pressed.
    const previous = new Map([
      [0, [0, 0]],
      [1, [0, 0]]
    ])
    assert.equal(readPads([pad(0), pad(1, [], [0, 0.9, 0, 0])], null, previous).active, 1)
  })

  test('is not taken from the active pad by a pushed stick', () => {
    // A light gun's aim is a pair of axes swept whenever it is pointed.
    const previous = new Map([
      [0, [0, 0]],
      [1, [0, 0]]
    ])
    assert.equal(readPads([pad(0), pad(1, [], [0.9, 0, 0, 0])], 0, previous).active, 0)
  })

  test('is not a pad whose stick rests off centre', () => {
    const previous = new Map([
      [0, [0.9, 0]],
      [1, [0, 0]]
    ])
    assert.equal(readPads([pad(0, [], [0.9, 0, 0, 0]), pad(1)], null, previous).active, null)
  })

  test('is not a pad seen off centre for the first time', () => {
    assert.equal(readPads([pad(0, [], [0.9, 0, 0, 0]), pad(1)], null, new Map()).active, null)
  })

  test('is the one whose hat is pushed, on a pad with no mapping', () => {
    const previous = new Map([
      [0, [0, 0]],
      [1, [0, 0, 0, 0]]
    ])
    const { buttons, active } = readPads(
      [pad(0), pad(1, [], [0, 0, 0, 0, 0, 0, 0, 1], '')],
      null,
      previous
    )
    assert.equal(active, 1)
    assert.deepEqual([...buttons], ['down'])
  })

  test('is a pad on its own, pressed or not', () => {
    // Its d-pad may be a hat, which is axes, and must work from the first push.
    const { buttons, active } = readPads([pad(3, [], [0, 0, 0, 0, 0, 0, 1, 0], '')], null)
    assert.equal(active, 3)
    assert.deepEqual([...buttons], ['right'])
  })

  test('is the one left when the active pad is unplugged', () => {
    assert.equal(readPads([null, pad(1)], 0).active, 1)
  })
})

describe('axes', () => {
  test('a stick off centre on the active pad moves without counting as a button', () => {
    // A stick resting off centre reports this with nobody pressing anything,
    // and it must not decide which hints are shown.
    const { buttons, sticks } = readPads([pad(0, [], [0.9, -0.9, 0, 0])], 0)
    assert.equal(buttons.size, 0)
    assert.deepEqual([...sticks].sort(), ['right', 'up'])
  })

  test('a stick off centre on an idle pad is ignored', () => {
    // Left alone, it would hold a direction down and walk the focus away
    // from the pad actually in use.
    const { sticks } = readPads([pad(0, [], [0.9, -0.9, 0, 0]), pad(1)], 1)
    assert.equal(sticks.size, 0)
  })

  test('a stick inside the dead zone is at rest', () => {
    const { sticks } = readPads([pad(0, [], [0.3, -0.3, 0, 0])], 0)
    assert.equal(sticks.size, 0)
  })

  test('the d-pad is a button, from any pad', () => {
    const { buttons, sticks } = readPads([pad(0), pad(1, [12, 15])], 0)
    assert.deepEqual([...buttons].sort(), ['right', 'up'])
    assert.equal(sticks.size, 0)
  })
})

describe('a pad Chromium has no mapping for', () => {
  test('its hat is the d-pad when it is the active pad', () => {
    const { buttons } = readPads([pad(0, [], [0, 0, 0, 0, 0, 0, -1, 1], '')], 0)
    assert.deepEqual([...buttons].sort(), ['down', 'left'])
  })

  test('its hat is ignored when another pad is active', () => {
    // Axes 6 and 7 are only a hat by assumption; at rest they may be
    // something else entirely, held at one end.
    const { buttons } = readPads([pad(0, [], [0, 0, 0, 0, 0, 0, -1, -1], ''), pad(1)], 1)
    assert.equal(buttons.size, 0)
  })

  test('its guide button is button 8', () => {
    assert.ok(readPads([pad(0, [8], [0, 0], '')], null).guide)
  })

  test('Start is button 7', () => {
    assert.ok(readPads([pad(0, [7], [0, 0], '')], null).buttons.has('start'))
  })

  test('on a mapped pad button 7 is the right trigger, not Start', () => {
    assert.ok(!readPads([pad(0, [7])], null).buttons.has('start'))
  })
})
