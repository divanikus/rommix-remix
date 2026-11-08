import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.addInitScript(() => {
    let bridge,
      report = () => {},
      item
    window.transfer = (id, state, percent, resumable = true) => {
      item = {
        romId: id,
        name: 'Large game',
        platform: 'Test system',
        state,
        totalBytes: 10 * 1024 ** 3,
        receivedBytes: (percent / 100) * 10 * 1024 ** 3,
        currentFile: 'Disc 1/Game.chd',
        resumable
      }
      report([item])
    }
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        value.system.emulatorStates = async () => [
          { id: 'retrodeck', available: true },
          { id: 'retroarch', available: true }
        ]
        value.library.installed = async () => []
        value.downloads.list = async () => (item ? [item] : [])
        value.downloads.onUpdate = (callback) => {
          report = callback
          return () => {}
        }
        value.downloads.pause = async () => {
          item = { ...item, state: 'paused' }
          report([item])
        }
        value.downloads.start = async () => {
          item = { ...item, state: 'downloading' }
          report([item])
          return item
        }
        value.downloads.cancel = async () => {
          item = { ...item, state: 'cancelled' }
          report([item])
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5275')
  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().click()
  const card = page.locator('.library-screen [data-rom]').first()
  const id = Number(await card.getAttribute('data-rom'))
  await page.evaluate((romId) => window.transfer(romId, 'downloading', 9), id)
  await card.click()
  const pause = page.locator('[data-action=pause]')
  const cancel = page.locator('[data-action=cancel-download]')
  await pause.waitFor()
  assert.equal(await pause.textContent(), 'Pause download')
  assert.equal(await cancel.textContent(), 'Cancel download')
  const before = await pause.boundingBox()
  await pause.hover()
  await page.evaluate((romId) => window.transfer(romId, 'downloading', 83), id)
  await page.locator('.download__percent').filter({ hasText: '83%' }).waitFor()
  assert.deepEqual(await pause.boundingBox(), before)
  assert.equal(await pause.getAttribute('data-focused'), 'true')
  assert.equal(await page.locator('.game-screen .download__bar').count(), 1)
  assert.equal(await page.locator('.game-screen .download__percent').count(), 1)
  assert.equal(await page.locator('.download__fill').getAttribute('style'), 'width: 83%;')
  await page.keyboard.press('Enter')
  const resume = page.locator('[data-action=download]')
  await resume.waitFor()
  assert.equal(await resume.textContent(), 'Resume download')
  assert.equal(await cancel.textContent(), 'Cancel download')
  assert.equal(await page.locator('.download__percent').textContent(), '83%')
  await resume.click()
  await pause.waitFor()
  await page.evaluate((romId) => window.transfer(romId, 'downloading', 83, false), id)
  await pause.waitFor({ state: 'detached' })
  await cancel.click()
  await page.locator('.game-screen .download__bar').waitFor({ state: 'detached' })
  await page.evaluate((romId) => window.transfer(romId, 'downloading', 83), id)
  await pause.waitFor()
  const dir = process.env.SHOTS_DIR ?? 'test/web/screenshots'
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/download-progress.png` })
  assert.deepEqual(errors, [])
  console.log(
    'Stable download actions, one progress display, keyboard pause and mouse resume/cancel passed'
  )
} finally {
  await browser.close()
}
