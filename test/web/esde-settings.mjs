import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.addInitScript(() => {
    let bridge
    window.esdeReady = false
    window.esdeWrites = []
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        value.system.esdeStatus = async () =>
          window.esdeReady
            ? {
                state: 'ready',
                roms: '/Emulation/roms',
                pending: 2,
                reason: 'Close ES-DE to publish pending metadata'
              }
            : { state: 'blocked', reason: 'EmuDeck paths are not verified' }
        const update = value.system.updateSettings
        value.system.updateSettings = async (patch) => {
          if ('enrichEsde' in patch) window.esdeWrites.push(patch.enrichEsde)
          return update(patch)
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.continue-card').waitFor()
  await page.keyboard.press('m')
  await page.locator('[data-action=open-settings]').click()
  await page.locator('[data-tab=games]').click()
  const setting = page.locator('[data-setting=enrichEsde]')
  await setting.waitFor()
  await setting.locator('[data-option=on]').click()
  assert.deepEqual(await page.evaluate(() => window.esdeWrites), [])
  await page.evaluate(() => {
    window.esdeReady = true
  })
  await page.locator('[data-action=esde-check]').click()
  await page.getByText('/Emulation/roms', { exact: true }).waitFor()
  await setting.locator('[data-option=on]').click()
  await page.waitForFunction(() => window.esdeWrites.length === 1)
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-setting=enrichEsde] [data-option=on]')
        ?.getAttribute('data-active') === 'true'
  )
  await setting.locator('[data-option=off]').click()
  await page.waitForFunction(() => window.esdeWrites.length === 2)
  assert.deepEqual(await page.evaluate(() => window.esdeWrites), [true, false])
  await page.mouse.move(0, 0)
  await page.locator('[data-action=esde-check]').hover()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('[data-action=esde-check]').getAttribute('data-focused'), 'true')
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2),
    false
  )
  assert.deepEqual(errors, [])
  console.log(
    'PASS 1280×800 ES-DE settings: unavailable gate, refresh, enable/disable, pending explanation and controller focus'
  )
} finally {
  await browser.close()
}
