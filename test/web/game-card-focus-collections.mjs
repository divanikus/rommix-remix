import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const press = async (selector) => {
  await page.mouse.move(0, 0)
  await page.locator(selector).hover()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
}
const focusIs = async (selector) => {
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.dataset.focused === 'true',
    selector
  )
}
try {
  await page.addInitScript(() => {
    let bridge
    window.collectionCalls = []
    window.failCreate = false
    window.failMember = false
    const shelves = []
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const rom = value.library.rom
        value.library.rom = async (id) => ({
          ...(await rom(id)),
          summary: 'A long description to exercise its focus outline. '.repeat(24),
          merged_screenshots: Array.from({ length: 6 }, (_, i) => `fixture-shot-${i}`)
        })
        const assetUrl = value.system.assetUrl
        value.system.assetUrl = (path) =>
          path?.startsWith('fixture-shot-')
            ? 'data:image/svg+xml,' +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#254d62"/></svg>'
              )
            : assetUrl(path)
        value.library.collections = async () => shelves
        value.library.createCollection = async (name) => {
          collectionCalls.push({ create: name })
          await new Promise((resolve) => setTimeout(resolve, 250))
          if (failCreate) throw Error('Creation refused')
          const shelf = {
            id: 42000 + shelves.length,
            name,
            rom_ids: [],
            rom_count: 0,
            description: '',
            is_virtual: false,
            is_favorite: false,
            path_cover_small: null,
            path_cover_large: null,
            path_covers_small: [],
            path_covers_large: []
          }
          shelves.push(shelf)
          return shelf
        }
        value.library.setCollection = async (romId, collectionId, member) => {
          collectionCalls.push({ romId, collectionId, member })
          if (failMember) throw Error('Adding game refused')
          const shelf = shelves.find((s) => s.id === collectionId)
          shelf.rom_ids = member ? [romId] : []
          shelf.rom_count = shelf.rom_ids.length
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5275')
  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-screen [data-rom]').first().waitFor()
  const romId = Number(
    await page.locator('.library-screen [data-rom]').first().getAttribute('data-rom')
  )
  await press('.library-screen [data-rom]:first-child')
  await page.locator('.game-hero__summary').waitFor()
  // Verify the actual painted edges, including every thumbnail against every
  // clipping ancestor. Merely checking overflow on .panel missed other clips.
  for (const width of [1920, 1600, 1280, 1067]) {
    await page.setViewportSize({ width, height: Math.round((width * 9) / 16) })
    const candidates = [
      '.game-hero__summary',
      ...Array.from(
        { length: await page.locator('.shot').count() },
        (_, i) => `.shot:nth-child(${i + 1})`
      )
    ]
    for (const selector of candidates) {
      await page.mouse.move(0, 0)
      await page.locator(selector).hover()
      await page.waitForTimeout(160)
      const obstructions = await page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect(),
          clips = []
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent),
            p = parent.getBoundingClientRect()
          if (
            ['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowX) &&
            (r.left - 4 < p.left || r.right + 4 > p.right)
          )
            clips.push(parent.className)
        }
        return clips
      })
      assert.deepEqual(
        obstructions,
        [],
        `${width}: ${selector} focus ring must not be clipped horizontally`
      )
    }
  }
  console.log(
    'PASS description and all thumbnail focus rings clear clipping ancestors at four UI canvases'
  )
  await page.setViewportSize({ width: 1600, height: 900 })
  await press('[data-action=collections]')
  await focusIs('[data-action=new-collection]')
  await page.keyboard.press('Enter')
  await focusIs('[data-field=collection-name]')
  assert.equal(
    await page.locator('[data-action=create-collection]').getAttribute('data-disabled'),
    'true'
  )
  await page.keyboard.press('ArrowDown')
  await focusIs('[data-action=cancel-collection]')
  await page.keyboard.press('ArrowUp')
  await focusIs('[data-field=collection-name]')
  await page.keyboard.press('Escape')
  await focusIs('[data-action=new-collection]')
  assert.deepEqual(await page.evaluate(() => collectionCalls), [])
  // Server rejection leaves the draft and the modal usable.
  await press('[data-action=new-collection]')
  await page.locator('[data-field=collection-name]').fill(' Weekend ')
  await page.keyboard.press('Escape') // leave text editing, not the modal
  await page.evaluate(() => {
    failCreate = true
  })
  await press('[data-action=create-collection]')
  await page.getByText('Creation refused', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-field=collection-name]').inputValue(), ' Weekend ')
  // Creation succeeds but membership fails: retain the shelf and retry its row.
  await page.evaluate(() => {
    failCreate = false
    failMember = true
  })
  await press('[data-action=create-collection]')
  await page.keyboard.press('Enter') // pending request must not duplicate the create
  await page.getByText('Adding game refused', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-collection]').count(), 1)
  assert.equal(await page.locator('[data-field=collection-name]').count(), 0)
  assert.equal(await page.locator('[data-collection] .status').textContent(), 'Add')
  await page.evaluate(() => {
    failMember = false
  })
  await press('[data-collection]')
  const calls = await page.evaluate(() => collectionCalls)
  assert.deepEqual(calls, [
    { create: 'Weekend' },
    { create: 'Weekend' },
    { romId, collectionId: 42000, member: true },
    { romId, collectionId: 42000, member: true }
  ])
  assert.equal(await page.locator('[data-collection] .status').textContent(), 'On')
  await press('[data-action=new-collection]')
  await press('[data-action=cancel-collection]')
  await focusIs('[data-action=new-collection]')
  await page.keyboard.press('Escape')
  await focusIs('[data-action=collections]')
  assert.equal(await page.locator('.overlay').count(), 0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS empty/nonempty collection creation, cancel/focus, failure, duplicate guard and membership-only retry'
  )
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
    await page.locator('.game-hero__summary').hover()
    await focusIs('.game-hero__summary')
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/card-focus-summary.png` })
    await page.locator('.shot').first().hover()
    await focusIs('.shot:first-child')
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/card-focus-shot.png` })
    await press('[data-action=collections]')
    await press('[data-action=new-collection]')
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/card-new-collection.png` })
  }
} finally {
  await browser.close()
}
