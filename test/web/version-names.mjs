import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let activePage
try {
  for (const shared of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    activePage = page
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((sharedNames) => {
      let bridge, base
      const pending = []
      window.versionReads = []
      window.holdDetails = true
      window.releaseDetails = () => {
        window.holdDetails = false
        pending.splice(0).forEach((resolve) => resolve())
      }
      Object.defineProperty(window, 'rommix', {
        get: () => bridge,
        set: (value) => {
          bridge = value
          const original = value.library.rom
          value.library.rom = async (id) => {
            window.versionReads.push(id)
            if (!base) base = await original(id)
            if (id !== base.id && id < 900001) return original(id)
            const records = [base.id, 900001, 900002].map((recordId, index) => {
              const name = sharedNames
                ? 'Moon Fighters'
                : `Moon Fighters and the Guardians of the Silver Kingdom (Version 95/03/22B, ${['Japan', 'World', 'USA'][index]})`
              const file = sharedNames
                ? `Moon Fighters (${['Japan', 'World', 'USA'][index]}) (Rev ${index + 1})`
                : ['moonfj', 'moonfw', 'moonfu'][index]
              return { id: recordId, name, fs_name_no_ext: file, is_main_sibling: index === 0 }
            })
            if (id !== base.id && window.holdDetails) {
              await new Promise((resolve) => pending.push(resolve))
              if (id === 900002) throw new Error('Fixture detail unavailable')
            }
            const record = records.find((row) => row.id === id)
            return {
              ...base,
              ...record,
              fs_name: `${record.fs_name_no_ext}.zip`,
              rom_user: { ...base.rom_user, is_main_sibling: record.is_main_sibling },
              sibling_roms: records.filter((row) => row.id !== id)
            }
          }
        }
      })
    }, shared)
    await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5275')
    await page.locator('[data-route=systems]').click()
    await page.locator('[data-system]').first().click()
    await page.locator('.library-screen [data-rom]').first().click()
    await page.locator('[data-action=choose-version]').click()
    const rows = page.locator('.overlay .asset-list [data-rom]')
    await rows.last().waitFor()
    const labels = await rows.locator('.version__name').allTextContents()
    assert.equal(labels.length, 3)
    assert.equal(await rows.locator('.version__filename').count(), shared ? 0 : 3)
    assert(
      labels.every((name) => name.startsWith(shared ? 'Moon Fighters (' : 'Moon Fighters and'))
    )
    await page.waitForFunction(() =>
      [900001, 900002].every((id) => window.versionReads.includes(id))
    )
    // Titles are already readable while detail requests are pending, and stay
    // readable if one request fails.
    await rows.filter({ hasText: shared ? '(World)' : 'moonfw' }).hover()
    await page.evaluate(() => window.releaseDetails())
    assert.deepEqual(await rows.locator('.version__name').allTextContents(), labels)
    assert.equal(
      await page.locator('.overlay [data-rom="900001"]').getAttribute('data-focused'),
      'true'
    )
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1920, height: 1080 }
    ]) {
      await page.setViewportSize(viewport)
      const overflow = await rows
        .locator('.version__name')
        .evaluateAll((elements) =>
          elements.some((element) => element.scrollWidth > element.clientWidth + 1)
        )
      assert.equal(overflow, false, 'version labels must wrap within the row')
    }
    if (process.env.SHOTS_DIR) {
      await mkdir(process.env.SHOTS_DIR, { recursive: true })
      await page.screenshot({
        path: `${process.env.SHOTS_DIR}/versions-${shared ? 'shared' : 'distinct'}.png`
      })
    }
    await page.keyboard.press('Escape')
    await page.waitForFunction(
      () => document.querySelector('[data-action=choose-version]')?.dataset.focused === 'true'
    )
    await page.keyboard.press('Enter')
    await page.locator('.overlay [data-rom="900001"]').hover()
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      (sharedNames) =>
        document.querySelector('.game-version strong')?.textContent ===
        (sharedNames ? 'Moon Fighters (World) (Rev 2).zip' : 'moonfw.zip'),
      shared
    )
    await page.locator('[data-tab=versions]').click()
    const tabRows = page.locator('.game-screen .asset-list [data-rom]')
    await tabRows.first().waitFor()
    assert.deepEqual(await tabRows.locator('.version__name').allTextContents(), labels)
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'Version titles, shared-name fallback, delayed/failed details, layouts and exact selection passed'
  )
} catch (error) {
  if (process.env.SHOTS_DIR && activePage && !activePage.isClosed()) {
    await mkdir(process.env.SHOTS_DIR, { recursive: true })
    await activePage.screenshot({ path: `${process.env.SHOTS_DIR}/versions-failure.png` })
  }
  throw error
} finally {
  await browser.close()
}
