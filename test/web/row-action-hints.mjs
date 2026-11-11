import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.setDefaultTimeout(10_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.pads = [0, 1].map((index) => ({
      id: `Row hint pad ${index}`,
      index,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }))
    Object.defineProperty(navigator, 'getGamepads', { value: () => window.pads })
    let bridge, base, update
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const settings = value.system.settings
        value.system.settings = async () => ({ ...(await settings()), language: 'ru' })
        const list = value.downloads.list
        value.downloads.list = async () => {
          base = (await list())[0]
          return [{ ...base, state: 'downloading' }]
        }
        value.downloads.onUpdate = (callback) => {
          update = callback
          return () => {
            update = undefined
          }
        }
        window.transferState = (state, resumable = true) =>
          update(state === null ? [] : [{ ...base, state, resumable }])
      }
    })
  })
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        )
    )
  const tap = async (button, pad = 0) => {
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
      await frames()
    }
  }
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5275')
  await page.locator('[data-route=systems]').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('[data-action=open-downloads]').click()
  await page.locator('.app[data-screen=downloads]').waitFor()
  await page.locator('[data-tab=activity]').click()
  const hint = page.locator('.hints > span').filter({ hasText: 'К кнопкам строки' })
  const row = page.locator('.download[data-download]').first()
  const focusRow = async () => {
    await page.mouse.move(5, 5)
    await row.hover({ position: { x: 25, y: 25 } })
    await page.waitForFunction(() =>
      document.querySelector('.download[data-download][data-focused=true]')
    )
  }
  const absent = async () => {
    await page.waitForFunction(
      () => !document.querySelector('.hints')?.textContent.includes('К кнопкам строки')
    )
    assert.equal(await hint.count(), 0)
  }
  await absent() // The tab/header is focused, not a row.
  await focusRow()
  await hint.waitFor()
  for (const pad of [0, 1]) {
    await tap(14, pad) // Establish gamepad input; Left at the row stays there.
    await hint.getByRole('img', { name: 'Крестовина вправо' }).waitFor()
    if (process.env.SCREENSHOT_DIR && pad === 0)
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/row-hint-gamepad.png` })
    await tap(15, pad)
    await row.locator('[data-action=pause-transfer][data-focused=true]').waitFor()
    await absent() // Already at the buttons.
    await tap(14, pad)
    await hint.waitFor()
  }
  await page.keyboard.press('ArrowRight')
  await row.locator('[data-action=pause-transfer][data-focused=true]').waitFor()
  await page.keyboard.press('ArrowLeft')
  await hint.waitFor()
  assert.equal(await hint.locator('.hint__key').textContent(), '→')
  assert.equal(await hint.getByRole('img').count(), 0)
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/row-hint-keyboard.png` })
  // Availability changes while the same row remains highlighted.
  for (const state of ['checking', 'extracting', 'installing', 'done', 'error', 'cancelled']) {
    await page.evaluate((nextState) => window.transferState(nextState), state)
    await focusRow()
    await absent()
  }
  for (const state of ['downloading', 'queued', 'paused', 'stalled']) {
    await page.evaluate((nextState) => window.transferState(nextState), state)
    await focusRow()
    await hint.waitFor()
  }
  // A non-resumable download still has Cancel, so the hint is useful.
  await page.evaluate(() => window.transferState('downloading', false))
  await focusRow()
  await hint.waitFor()
  assert.equal(await row.locator('[data-action=pause-transfer]').count(), 0)
  assert.equal(await row.locator('[data-action=cancel-transfer]').count(), 1)
  await page.evaluate(() => window.transferState(null))
  await absent()
  assert.equal(await page.locator('.download[data-download]').count(), 0)

  await page.locator('[data-tab=device]').click()
  await absent()
  const group = page.locator('.group__header[data-system]').first()
  await group.click()
  await absent() // A group only expands; its game rows have the buttons.
  const installed = page.locator('.installed[data-rom]').first()
  await installed.hover({ position: { x: 25, y: 25 } })
  await hint.waitFor()
  await page.keyboard.press('ArrowRight')
  await installed.locator('[data-action=uninstall-game][data-focused=true]').waitFor()
  await absent()
  await page.keyboard.press('ArrowLeft')
  await hint.waitFor()
  await page.locator('[data-utility-route=settings]').click()
  await absent()
  assert.deepEqual(errors, [])
  console.log(
    'PASS: contextual row hints, keyboard arrow, both gamepad D-pads, actionless/empty rows and live state changes'
  )
} finally {
  await browser.close()
}
