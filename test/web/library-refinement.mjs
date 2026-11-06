import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const frames = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
const tap = async (n) => {
  await page.evaluate((button) => (pad.buttons[button] = { pressed: true, value: 1 }), n)
  await frames()
  await page.evaluate((button) => (pad.buttons[button] = { pressed: false, value: 0 }), n)
  await frames()
}
const focused = () => page.locator('[data-focused="true"]').last()
const waitRom = (id) => page.locator(`[data-rom="${id}"][data-focused="true"]`).waitFor()
try {
  await page.addInitScript(() => {
    window.pad = {
      id: 'Refinement fixture',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] })
    let bridge
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const list = value.library.roms,
          rom = value.library.rom
        let fixture = []
        value.library.roms = async (q) => {
          const result = await list(q)
          if (q.last_played)
            return {
              ...result,
              items: result.items.map((r) => ({
                ...r,
                summary: 'A detailed last-played description supplied by the server.'
              }))
            }
          if (q.search_term !== 'he') return result
          if (!fixture.length) {
            const seed = (await list({ limit: 1 })).items[0]
            fixture = Array.from({ length: 180 }, (_, i) => {
              const letter = String.fromCharCode(65 + Math.floor(i / 70))
              const name = `${i % 2 ? 'A' : 'The'} ${letter}he adventure ${i}`
              return {
                ...seed,
                id: 200000 + i,
                name,
                name_sort_key: `${letter.toLowerCase()}he adventure ${i}`,
                sibling_roms: []
              }
            })
          }
          const items = q.order_dir === 'desc' ? fixture.toReversed() : fixture
          const offset = q.offset ?? 0,
            limit = q.limit ?? 60
          await new Promise((r) => setTimeout(r, 80))
          return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
        }
        value.library.rom = (id) =>
          fixture.find((r) => r.id === id)
            ? Promise.resolve(fixture.find((r) => r.id === id))
            : rom(id)
        value.library.playTime = () => Promise.resolve(10800)
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.continue-card').waitFor()
  assert.match(await page.title(), /demo/i)
  await page.locator('.continue-card__played').waitFor()
  assert.match(await page.locator('.continue-card__summary').textContent(), /description/)
  assert.ok((await page.locator('.continue-card__cover').boundingBox()).width >= 140)
  await page.locator('.continue-card').hover()
  await page.mouse.move(0, 0)
  await tap(5)
  await page.locator('.systems-screen').waitFor()
  await page.locator('[data-system]').first().hover()
  await page.mouse.move(0, 0)
  await tap(5)
  await page.locator('.collections-screen').waitFor()
  await tap(5)
  await page.locator('.search-prompt').waitFor()
  await tap(5)
  await page.locator('.continue-card').waitFor()
  await tap(4)
  await page.locator('.search-prompt').waitFor()
  console.log(
    'PASS root shoulders cycle all four sections from content; Last Played shows real description/time'
  )
  await page.locator('[data-route="settings"]').click()
  await tap(5)
  assert.equal(await page.locator('.search-prompt').count(), 1)
  await tap(1)
  console.log('PASS modal input does not switch the background section')
  await page.locator('[data-route="systems"]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-grid .card').first().waitFor()
  assert.equal(await page.locator('.topbar').count(), 0)
  const platform = await page
    .locator('[data-platform-slot="current"]')
    .getAttribute('data-platform')
  await tap(5)
  await page.waitForFunction(
    (id) => document.querySelector('[data-platform-slot="current"]')?.dataset.platform !== id,
    platform
  )
  await page.locator('.library-grid .card[data-focused="true"]').waitFor()
  const current = await page.locator('[data-platform-slot="current"]').getAttribute('data-platform')
  const game = await focused().getAttribute('data-rom')
  await tap(8)
  assert.ok(await focused().getAttribute('data-platform-slot'))
  await tap(8)
  await waitRom(game)
  await tap(1)
  await page.locator('.systems-screen').waitFor()
  await page.locator(`[data-system="${current}"][data-focused="true"]`).waitFor()
  assert.equal(await page.locator('.topbar').count(), 1)
  console.log(
    'PASS platform carousel replaces root header; Select returns; Back selects the current platform'
  )
  await page.locator('[data-route="library"]').click()
  await page.locator('[data-field="library-search"]').fill('he')
  await page.locator('.library-grid .card').first().waitFor()
  await page.locator('[data-control="layout"] [data-option="list"]').click()
  await tap(13)
  await waitRom(200000)
  await tap(7)
  await waitRom(200070)
  assert.equal(await page.locator('.library-letter').textContent(), 'B')
  await tap(7)
  await waitRom(200140)
  assert.equal(await page.locator('.library-letter').textContent(), 'C')
  await tap(6)
  await waitRom(200070)
  assert.equal(await page.locator('.library-letter').textContent(), 'B')
  console.log(
    'PASS he in List jumps by server sort keys across pages, not alternating title articles A/T'
  )
  await tap(0)
  await page.locator('.game-screen [data-focused="true"]').waitFor()
  const before = await page
    .locator('.game-screen [data-tab][data-active="true"]')
    .getAttribute('data-tab')
  await tap(5)
  assert.notEqual(
    await page.locator('.game-screen [data-tab][data-active="true"]').getAttribute('data-tab'),
    before
  )
  assert.equal(await page.locator('.library-screen').count(), 0)
  await tap(1)
  await waitRom(200070)
  await page.locator('[data-control="layout"] [data-option="grid"]').click()
  assert.equal(await page.locator('[data-option="compact"]').count(), 0)
  await page.locator('[data-control="cover-size"] [data-option="small"]').click()
  const small = await page
    .locator('.library-grid')
    .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)
  await page.locator('[data-control="cover-size"] [data-option="medium"]').click()
  const medium = await page
    .locator('.library-grid')
    .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)
  assert.ok(small > medium)
  console.log('PASS detail shoulders retain tabs; three denser sizes preserve operations')
  for (const width of [390, 700, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.locator('[data-route="home"]').click()
    await page.locator('.continue-card').waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
  }
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.locator('[data-widget="anniversary"] .home-widget__footer small').waitFor()
  assert.ok(
    await page.locator('[data-widget="anniversary"]').evaluate((e) => {
      const edge = e.getBoundingClientRect().bottom
      return [...e.children].every((child) => child.getBoundingClientRect().bottom <= edge)
    }),
    'anniversary content and counter fit inside the widget'
  )
  assert.deepEqual(errors, [])
  console.log('PASS responsive Home and header fit narrow/wide screens without renderer errors')
} finally {
  await browser.close()
}
