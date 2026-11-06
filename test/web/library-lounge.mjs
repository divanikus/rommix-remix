// Real renderer/input with the public demo bridge; never a live library.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'chrome',
  headless: true
})
const page = await browser.newPage({
  viewport: { width: 1422, height: 800 },
  deviceScaleFactor: 1.35
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (e) => {
  if (e.type() === 'error' && /Maximum update|React has detected/.test(e.text()))
    errors.push(e.text())
})
const check = (name) => console.log('PASS', name)
const frames = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
const tap = async (button) => {
  await page.evaluate((b) => {
    testPad.buttons[b] = { pressed: true, value: 1 }
  }, button)
  await frames()
  await page.evaluate((b) => {
    testPad.buttons[b] = { pressed: false, value: 0 }
  }, button)
  await frames()
}
try {
  await page.addInitScript(() => {
    window.testPad = {
      id: 'Lounge fixture',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [testPad] })
    let bridge
    Object.defineProperty(window, 'rommix', {
      configurable: true,
      get: () => bridge,
      set: (value) => {
        bridge = value
        bridge.server.onStatus = (listener) => {
          window.connectionStatus = listener
          return () => {}
        }
        bridge.library.onAdopted = (listener) => {
          window.adopted = listener
          return () => {}
        }
        window.queries = []
        const roms = bridge.library.roms
        bridge.library.roms = async (query) => {
          window.queries.push(query)
          return roms(query)
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.home-screen .row--scenes .card').first().waitFor()
  assert.match(await page.title(), /demo/i)
  await page.waitForTimeout(250)
  const first = page.locator('[data-shelf="continue"] .card').first(),
    id = await first.getAttribute('data-rom')
  await first.hover()
  await page.mouse.move(0, 0)
  for (let i = 0; i < 3; i++) await tap(15)
  assert.ok(await page.locator('[data-shelf="continue"] [data-focused="true"]').count())
  await first.click()
  await page.locator('.game-screen').waitFor()
  await tap(1)
  await page.locator(`[data-shelf="continue"] [data-rom="${id}"][data-focused="true"]`).waitFor()
  check('screenshot shelf navigates and returns to the exact played version')
  const local = await page.evaluate(() => rommix.library.installed())
  await page.evaluate((entries) => adopted([entries[0]]), local)
  await page.locator('.toast[data-tone="info"]').waitFor()
  assert.equal(await page.locator('.toast.notice--ok').count(), 0)
  const tone = await page.locator('.toast[data-tone="info"]').evaluate((e) => ({
    color: getComputedStyle(e).color,
    bg: getComputedStyle(e).backgroundColor
  }))
  assert.notEqual(tone.color, 'rgb(74, 222, 128)')
  check('disk discovery emits a neutral informational toast')
  await page.locator('[data-action="pick-again"]').click()
  await page.locator('[data-widget="pick"][aria-busy="false"] [data-action="open-pick"]').click()
  await page.locator('.game-screen').waitFor()
  await tap(1)
  await page.locator('[data-action="open-pick"][data-focused="true"]').waitFor()
  check('server random pick opens details and restores its widget focus')
  const virtual = await page.evaluate(() => rommix.library.virtualCollections())
  assert.ok(virtual.length)
  assert.equal(await page.locator('[data-shelf="virtual-collections"]').count(), 0)
  await page.locator('[data-route="collections"]').click()
  await page.locator('[data-control="collection-kind"] [data-option="virtual"]').click()
  await page.locator('[data-collection]').first().click()
  await page.locator('.library-grid .card').first().waitFor()
  assert.ok(
    await page.evaluate((v) => queries.some((q) => q.virtual_collection_id === v), virtual[0].id)
  )
  await page.locator('.library-control [data-option="downloaded"]').click()
  const members = virtual[0].rom_ids
    .filter((memberId) => local.some((game) => game.romId === memberId))
    .sort((a, b) => a - b)
  await page.waitForFunction(
    (n) => document.querySelectorAll('.library-grid .card').length === n,
    members.length
  )
  assert.deepEqual(
    (
      await page
        .locator('.library-grid .card')
        .evaluateAll((cards) => cards.map((c) => Number(c.dataset.rom)))
    ).sort((a, b) => a - b),
    members
  )
  await page.locator('.library-control [data-option="all"]').click()
  await page.locator('.library-grid .card').first().waitFor()
  check('downloaded collection scope uses exact server membership, not every installed game')
  assert.equal(await page.locator('[data-route="collections"][data-active="true"]').count(), 1)
  await page.locator('[data-control="layout"] [data-option="list"]').click()
  await page.locator('.library-row').first().waitFor()
  await page.locator('.library-row').first().hover()
  await page.mouse.move(0, 0)
  await tap(0)
  await page.waitForFunction(() => document.querySelector('.game-screen [data-focused="true"]'))
  await tap(1)
  await page.locator('.library-row[data-focused=true]').waitFor()
  await tap(1)
  await page.locator(`.collections-screen [data-collection][data-focused="true"]`).waitFor()
  check('explicit virtual collection ID reaches the shared table and Back restores Collections')
  await page.locator('[data-route="collections"]').click()
  await page.locator('[data-control="collection-kind"] [data-option="virtual"]').click()
  await page.locator('[data-collection]').first().click()
  await page.locator('.library-row').first().waitFor()
  await page.locator('[data-control="layout"] [data-option="grid"]').click()
  const game = page.locator('.library-grid .card').first(),
    gameId = await game.getAttribute('data-rom')
  await game.click()
  await page.locator('.game-screen').waitFor()
  await tap(1)
  await page.locator(`.library-grid [data-rom="${gameId}"][data-focused="true"]`).waitFor()
  await tap(1)
  await page.locator(`[data-collection="${virtual[0].id}"][data-focused="true"]`).waitFor()
  assert.equal(
    await page
      .locator('[data-control="collection-kind"] [data-option="virtual"][data-active="true"]')
      .count(),
    1
  )
  check('collection grid sizes/views and deep Back preserve collection identity and filters')
  await page.evaluate(async () => {
    const platforms = await rommix.library.platforms()
    rommix.library.platforms = async () =>
      platforms.map((p, i) => ({
        ...p,
        family_name: i % 2 ? 'Family A' : 'Family B',
        category: i % 2 ? 'console' : 'computer',
        generation: (i % 3) + 1
      }))
  })
  await page.locator('[data-route="systems"]').click()
  await page.locator('[data-system]').first().waitFor()
  await page.locator('[data-control="systems-layout"] [data-option="list"]').click()
  await page.waitForTimeout(250)
  assert.ok((await page.locator('[data-system]').first().boundingBox()).height <= 90)
  assert.equal(
    await page
      .locator('[data-control="systems-layout"] [data-option="list"][data-focused="true"]')
      .count(),
    1
  )
  for (const mode of ['family', 'category', 'generation', 'local', 'letter', 'none']) {
    await page.locator(`[data-control="systems-group"] [data-option="${mode}"]`).click()
    await page.waitForTimeout(100)
    assert.ok(await page.locator('[data-system]').count())
    assert.equal(
      await page
        .locator(`[data-control="systems-group"] [data-option="${mode}"][data-focused="true"]`)
        .count(),
      1
    )
  }
  await page.locator('[data-system]').first().hover()
  await page.mouse.move(0, 0)
  await tap(13)
  assert.ok(await page.locator('[data-system][data-focused="true"]').count())
  await tap(0)
  await page.locator('.library-screen').waitFor()
  await tap(1)
  await page.locator('[data-system][data-focused="true"]').waitFor()
  assert.equal(await page.locator('.systems-screen').getAttribute('data-systems-layout'), 'list')
  check('platform list, six groupings and return keep controller focus and preferences')
  for (const width of [390, 700, 1280, 1422, 1920]) {
    await page.setViewportSize({ width, height: 800 })
    for (const route of ['home', 'systems', 'collections']) {
      await page.locator(`[data-route="${route}"]`).click()
      await page.waitForTimeout(150)
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
        `${route} overflow ${width}`
      )
    }
  }
  await page.locator('[data-route="collections"]').click()
  await page.locator('[data-control="collection-kind"] [data-option="mine"]').click()
  await page.locator('[data-collection]').first().waitFor()
  await page.locator('[data-collection]').first().click()
  await page.locator('.library-screen').waitFor()
  await page.evaluate(async () =>
    connectionStatus({ ...(await rommix.server.status()), offline: true, connected: false })
  )
  await page.locator('.home-screen [data-shelf="ready"] .card').first().waitFor()
  assert.equal(await page.locator('.library-screen').count(), 0)
  assert.equal(await page.locator('.home-screen .spinner').count(), 0)
  check('connection loss preserves RomMix offline routing back to real installed games')
  const fallback = await browser.newPage({ viewport: { width: 1422, height: 800 } })
  fallback.on('pageerror', (e) => errors.push(e.message))
  await fallback.addInitScript(() => {
    let bridge
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const roms = value.library.roms
        value.library.roms = async (query) => {
          const result = await roms(query)
          return {
            ...result,
            items: result.items.map((r) => ({
              ...r,
              merged_screenshots: ['/missing-fixture-shot.png']
            }))
          }
        }
      }
    })
  })
  await fallback.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await fallback.locator('.scene-art__fallback').first().waitFor()
  assert.ok(await fallback.locator('.scene-art__fallback .cover img').count())
  await fallback.close()
  const offline = await browser.newPage({ viewport: { width: 1422, height: 800 } })
  offline.on('pageerror', (e) => errors.push(e.message))
  await offline.addInitScript(() => {
    let bridge
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const status = value.server.status
        value.server.status = async () => ({ ...(await status()), offline: true, connected: false })
        for (const name of ['roms', 'virtualCollections'])
          value.library[name] = async () => {
            throw Error('Unexpected offline fetch')
          }
      }
    })
  })
  await offline.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await offline.locator('[data-shelf="ready"] .card').first().waitFor()
  assert.equal(await offline.locator('[data-shelf="virtual-collections"]').count(), 0)
  assert.equal(await offline.locator('[data-widget="pick"]').count(), 0)
  assert.equal(await offline.locator('.notice--error').count(), 0)
  await offline.close()
  check('missing screenshots fall back to covers; offline Home keeps only real local data')
  assert.deepEqual(errors, [])
  check('home, systems and collections fit narrow/wide viewports without renderer errors')
} finally {
  await browser.close()
}
