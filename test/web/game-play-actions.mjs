import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('pageerror', (error) => errors.push(error.message))
const focusIs = (action) =>
  page.waitForFunction(
    (value) => document.querySelector(`[data-action="${value}"]`)?.dataset.focused === 'true',
    action
  )
const openGame = async (primary = 'play') => {
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5275')
  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-screen [data-rom]').first().click()
  await page.locator(`[data-action=${primary}]`).waitFor()
}
try {
  await page.addInitScript(() => {
    let bridge
    window.launches = []
    window.remoteLaunches = []
    window.downloadsStarted = []
    window.failRemoval = false
    window.removals = 0
    const removed = new Set()
    let chosen = 'first'
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const settings = value.system.settings
        value.system.settings = async () => ({
          ...(await settings()),
          confirmUninstall: !localStorage.noConfirm
        })
        value.system.emulatorStates = async () => [{ id: 'retroarch', available: true }]
        const installed = value.library.installed
        value.library.installed = async () => {
          if (localStorage.notInstalled) return []
          const [sample] = await installed()
          return Array.from({ length: 400 }, (_, i) => ({ ...sample, romId: i + 1 })).filter(
            (entry) => !removed.has(entry.romId)
          )
        }
        value.downloads.uninstall = async (id) => {
          window.removals++
          await new Promise((resolve) => setTimeout(resolve, 200))
          if (window.failRemoval) throw new Error('Removal refused')
          removed.add(id)
        }
        value.game.variants = async () => ({
          system: 'Test system',
          emulatorId: 'retrodeck',
          emulatorName: 'RetroDECK',
          setupNotes: [],
          ask: false,
          chosen,
          options: localStorage.singleVariant
            ? [{ id: 'first', label: 'First runner' }]
            : [
                { id: 'first', label: 'First runner' },
                { id: 'second', label: 'Second runner', note: 'Another way to play' }
              ]
        })
        value.game.launch = async (_id, variant) => {
          chosen = variant ?? chosen
          window.launches.push(chosen)
          await new Promise((resolve) => setTimeout(resolve, 200))
          return { ok: true, uploadedSaves: 0, uploadedStates: 0 }
        }
        value.game.rommPlayers = async () => ({
          browser: Boolean(localStorage.remotePlayers),
          stream: localStorage.remotePlayers === 'both'
        })
        value.game.playOnRomm = async (_id, player) => window.remoteLaunches.push(player)
        value.downloads.start = async (id) => {
          window.downloadsStarted.push(id)
          return { state: 'downloading', name: 'Test game', coverPath: null }
        }
      }
    })
  })
  await openGame()
  const main = await page.locator('[data-action=play]').boundingBox()
  const arrow = await page.locator('[data-action=run-with]').boundingBox()
  assert.ok(Math.abs(main.x + main.width - arrow.x) < 1, 'the arrow must touch Play')
  assert.equal(main.y, arrow.y)
  await page.locator('[data-action=play]').hover()
  await page.keyboard.press('ArrowRight')
  await focusIs('run-with')
  await page.keyboard.press('Enter')
  await focusIs('variant-first')
  await page.keyboard.press('ArrowDown')
  await focusIs('variant-second')
  await page.keyboard.press('Escape')
  await focusIs('run-with')
  assert.equal(await page.locator('.launch-menu').count(), 0)
  assert.deepEqual(await page.evaluate(() => window.launches), [])
  await page.locator('[data-action=run-with]').click()
  await page.locator('.launch-menu').waitFor()
  await page.mouse.click(5, 5)
  await focusIs('run-with')
  assert.equal(await page.locator('.launch-menu').count(), 0)
  await page.keyboard.press('Enter')
  await page.locator('[data-action=variant-second]').click()
  await page.waitForFunction(() => window.launches.length === 1)
  await page.waitForFunction(
    () => document.querySelector('[data-action=play]')?.dataset.disabled === 'false'
  )
  await page.locator('[data-action=play]').click()
  await page.waitForFunction(() => window.launches.length === 2)
  assert.deepEqual(await page.evaluate(() => window.launches), ['second', 'second'])
  await page.waitForFunction(
    () => document.querySelector('[data-action=play]')?.dataset.disabled === 'false'
  )
  await page.locator('[data-action=run-with]').click()
  await focusIs('variant-second')
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 800, height: 600 }
  ]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(100)
    const box = await page.locator('.launch-menu').boundingBox()
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height
    )
  }
  const shotDir = process.env.SHOTS_DIR ?? 'test/web/screenshots'
  await mkdir(shotDir, { recursive: true })
  await page.screenshot({ path: `${shotDir}/game-play-menu.png` })
  await page.keyboard.press('Escape')
  // An action row near the bottom must open upward without moving the row.
  await page.evaluate(() => {
    document.querySelector('.game-play').style.marginTop = '160px'
  })
  const lowButton = await page.locator('[data-action=play]').boundingBox()
  const rowOffset = await page.locator('.game-play').evaluate((element) => element.offsetTop)
  await page.locator('[data-action=run-with]').click()
  await focusIs('variant-second')
  const upward = await page.locator('.launch-menu').boundingBox()
  assert.ok(upward.y + upward.height <= lowButton.y, 'the menu should open above the row')
  assert.equal(await page.locator('.game-play').evaluate((element) => element.offsetTop), rowOffset)
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    document.querySelector('.game-play').style.marginTop = ''
  })
  await page.locator('[data-action=uninstall]').click()
  await page.locator('[data-action=keep-game]').click()
  assert.equal(await page.evaluate(() => window.removals), 0)
  assert.equal(await page.locator('[data-action=download]').count(), 0)
  await page.evaluate(() => {
    window.failRemoval = true
  })
  await page.locator('[data-action=uninstall]').click()
  await page.locator('[data-action=uninstall-confirm]').click()
  await page.waitForFunction(
    () => document.querySelector('[data-action=play]')?.dataset.disabled === 'false'
  )
  assert.equal(await page.locator('[data-action=download]').count(), 0)
  await page.evaluate(() => {
    window.failRemoval = false
  })
  await page.locator('[data-action=uninstall]').click()
  await page.locator('[data-action=uninstall-confirm]').click()
  await focusIs('download')
  assert.equal(await page.locator('[data-action=download]').getAttribute('data-disabled'), 'false')
  await page.evaluate(() => {
    localStorage.noConfirm = '1'
    localStorage.singleVariant = '1'
  })
  await openGame()
  assert.equal(await page.locator('[data-action=run-with]').count(), 0)
  await page.locator('[data-action=uninstall]').hover()
  await page.keyboard.press('Enter')
  await focusIs('download')
  assert.equal(await page.locator('.overlay').count(), 0)
  assert.equal(await page.evaluate(() => window.removals), 1)

  await page.evaluate(() => {
    delete localStorage.singleVariant
    localStorage.remotePlayers = 'both'
  })
  await openGame()
  await page.locator('[data-action=run-with]').click()
  await focusIs('variant-first')
  const menu = page.locator('.launch-menu')
  await menu.locator('[data-action=play-on-romm]').waitFor()
  assert.equal(await page.locator('.game-actions [data-action=play-on-romm]').count(), 0)
  assert.equal(await page.locator('.game-actions [data-action=stream-from-romm]').count(), 0)
  await menu.locator('[data-action=stream-from-romm]').click()
  await focusIs('run-with')
  assert.deepEqual(await page.evaluate(() => window.remoteLaunches), ['stream'])
  assert.deepEqual(await page.evaluate(() => window.launches), [])

  await page.evaluate(() => {
    localStorage.singleVariant = '1'
  })
  await openGame()
  await page.locator('[data-action=run-with]').click()
  await focusIs('play-on-romm')
  assert.equal(await menu.locator('[data-action^=variant-]').count(), 0)
  await page.keyboard.press('Escape')

  await page.evaluate(() => {
    localStorage.notInstalled = '1'
    localStorage.remotePlayers = 'browser'
  })
  await openGame('download')
  const download = await page.locator('[data-action=download]').boundingBox()
  const downloadArrow = await page.locator('[data-action=run-with]').boundingBox()
  assert.ok(Math.abs(download.x + download.width - downloadArrow.x) < 1)
  assert.equal(download.y, downloadArrow.y)
  await page.evaluate(() => {
    const pad = {
      id: 'Test pad',
      index: 0,
      mapping: 'standard',
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }
    navigator.getGamepads = () => [pad]
    window.tapPad = async (index) => {
      pad.buttons[index] = { pressed: true, value: 1 }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      pad.buttons[index] = { pressed: false, value: 0 }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }
  })
  await focusIs('download')
  await page.evaluate(() => window.tapPad(15))
  await focusIs('run-with')
  await page.evaluate(() => window.tapPad(0))
  await focusIs('play-on-romm')
  assert.equal(await menu.locator('[data-action=stream-from-romm]').count(), 0)
  await page.evaluate(() => window.tapPad(1))
  await focusIs('run-with')
  await page.evaluate(() => window.tapPad(0))
  await focusIs('play-on-romm')
  await page.evaluate(() => window.tapPad(0))
  await focusIs('run-with')
  assert.deepEqual(await page.evaluate(() => window.remoteLaunches), ['browser'])
  assert.deepEqual(await page.evaluate(() => window.downloadsStarted), [])
  await page.locator('[data-action=download]').click()
  await page.waitForFunction(() => window.downloadsStarted.length === 1)

  assert.deepEqual(errors, [])
  console.log(
    'Launch menu, keyboard/mouse/gamepad input, local and RomM routes, download and uninstall passed'
  )
} finally {
  await browser.close()
}
