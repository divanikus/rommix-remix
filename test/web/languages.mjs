import assert from 'node:assert/strict'
import { LOCALES, LANGUAGE_NAMES } from '../../src/shared/i18n/locales.ts'
import { CATALOGS } from '../../src/shared/i18n/catalogs.ts'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.addInitScript(() => {
    window.pads = [0, 1].map((index) => ({
      id: `Language test pad ${index}`,
      index,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }))
    Object.defineProperty(navigator, 'getGamepads', { value: () => window.pads })
  })
  const tap = async (button, pad) => {
    for (const pressed of [true, false]) {
      await page.evaluate(
        ([buttonIndex, padIndex, isPressed]) => {
          window.pads[padIndex].buttons[buttonIndex] = {
            pressed: isPressed,
            value: isPressed ? 1 : 0
          }
        },
        [button, pad, pressed]
      )
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          )
      )
    }
  }
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5275')
  await page.locator('[data-route=systems]').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('[data-action=open-settings]').click()
  await page.locator('[data-tab=general]').click()
  const trigger = page.locator('[data-action=language]')
  const popup = page.locator('.language-dropdown')
  await trigger.click()
  assert.equal(await page.getByRole('option').count(), LOCALES.length + 1)
  await page.keyboard.press('Escape')
  assert.equal(await popup.count(), 0)
  assert.equal(await trigger.getAttribute('data-focused'), 'true')
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true)
  // Movement alone must not change the setting. B/Escape cancels the draft.
  const original = await page.evaluate(async () => (await window.rommix.system.settings()).language)
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  assert.equal(
    await page.evaluate(async () => (await window.rommix.system.settings()).language),
    original
  )
  for (const pad of [0, 1]) {
    await trigger.hover()
    await tap(0, pad)
    await popup.waitFor()
    await tap(13, pad)
    await tap(1, pad)
    await popup.waitFor({ state: 'detached' })
    assert.equal(await trigger.getAttribute('data-focused'), 'true')
    assert.equal(
      await page.evaluate(async () => (await window.rommix.system.settings()).language),
      original
    )
  }
  for (const locale of LOCALES) {
    await trigger.click()
    await page.locator(`[data-option="${locale}"]`).click()
    await page.waitForFunction(
      (name) => document.querySelector('[data-action=language]')?.textContent.includes(name),
      LANGUAGE_NAMES[locale]
    )
    assert.equal(
      await page.evaluate(async () => (await window.rommix.system.settings()).language),
      locale
    )
    assert.equal(
      (await page.locator('[data-utility-route=settings]').textContent()).trim(),
      CATALOGS[locale]['nav.settings']
    )
  }
  // The selected last entry is revealed when the list is reopened.
  await trigger.click()
  const selected = page.locator('[role=option][aria-selected=true]')
  await selected.waitFor()
  assert.equal(await selected.getAttribute('data-focused'), 'true')
  assert.equal(await selected.evaluate((element) => element === document.activeElement), true)
  const bounds = await selected.boundingBox()
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 800)
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/language-dropdown.png` })
  // Choosing with the keyboard closes the list and returns focus too.
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await popup.waitFor({ state: 'detached' })
  assert.equal(await trigger.getAttribute('data-focused'), 'true')
  await trigger.click()
  await page.mouse.click(5, 5)
  await popup.waitFor({ state: 'detached' })
  for (const viewport of [
    { width: 800, height: 600 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport)
    await trigger.click()
    const box = await popup.boundingBox()
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height
    )
    await page.keyboard.press('Escape')
  }
  await trigger.click()
  await popup.locator('[data-option=auto]').click()
  assert.equal(
    await page.evaluate(async () => (await window.rommix.system.settings()).language),
    'auto'
  )
  const setup = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  setup.on('pageerror', (error) => errors.push(error.message))
  await setup.addInitScript(() => {
    let bridge
    Object.defineProperty(window, 'rommix', {
      configurable: true,
      get: () => bridge,
      set: (next) => {
        bridge = next
        const settings = next.system.settings
        next.system.settings = async () => ({ ...(await settings()), setupComplete: false })
        const status = next.server.status
        next.server.status = async () => ({
          ...(await status()),
          connected: false,
          configured: false,
          offline: false
        })
      }
    })
  })
  await setup.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5275')
  await setup.locator('[data-action=language]').click()
  await setup.locator('[data-option=uk]').click()
  await setup.waitForFunction(() =>
    document.querySelector('[data-action=language]')?.textContent.includes('Українська')
  )
  assert.equal(await setup.locator('[data-screen=setup]').count(), 1)
  await setup.locator('[data-option="2"]').click()
  await setup.locator('[data-action=language]').click()
  const setupBounds = await setup.locator('.language-dropdown').boundingBox()
  assert.ok(
    setupBounds.x >= 0 &&
      setupBounds.y >= 0 &&
      setupBounds.x + setupBounds.width <= 1280 &&
      setupBounds.y + setupBounds.height <= 800
  )
  if (process.env.SCREENSHOT_DIR)
    await setup.screenshot({ path: `${process.env.SCREENSHOT_DIR}/setup-ukrainian.png` })
  await setup.keyboard.press('Escape')
  assert.equal(await setup.locator('[data-action=language]').getAttribute('data-focused'), 'true')
  assert.deepEqual(errors, [])
  console.log(
    `PASS: ${LOCALES.length} locale switches, dropdown selection/cancel/focus/scroll and viewport bounds`
  )
} finally {
  await browser.close()
}
