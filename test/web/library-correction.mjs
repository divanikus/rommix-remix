import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const pass = (name) => console.log('PASS', name)
const tap = async (button) => {
  await page.evaluate((n) => (pad.buttons[n] = { pressed: true, value: 1 }), button)
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
  await page.evaluate((n) => (pad.buttons[n] = { pressed: false, value: 0 }), button)
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
}
const focused = () => page.locator('[data-focused="true"]').last()
try {
  await page.addInitScript(() => {
    window.pad = {
      id: 'Collection regression',
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
        window.queries = []
        const list = value.library.roms,
          groups = value.library.virtualCollections
        const getRom = value.library.rom
        value.library.rom = async (id) =>
          id >= 100000
            ? {
                ...(await list({ limit: 1 })).items[0],
                id,
                name: 'Fixture ' + id,
                sibling_roms: []
              }
            : getRom(id)
        value.library.virtualCollections = async () => {
          const base = (await groups())[0]
          return Array.from({ length: 180 }, (_, i) => ({
            ...base,
            id: 'group-' + i,
            name:
              String(i).padStart(3, '0') +
              ' collection ' +
              (i % 3 === 0 ? 'with a longer title to wrap onto another line' : ''),
            rom_count: 360
          }))
        }
        value.library.roms = async (q) => {
          queries.push(q)
          if (!q.virtual_collection_id) return list(q)
          const source = await list({ limit: 60 })
          const items = Array.from({ length: 360 }, (_, i) => ({
            ...source.items[i % source.items.length],
            id: 100000 + i,
            name:
              String(i).padStart(3, '0') +
              ' Game ' +
              (i % 4 === 0 ? 'with a long title that wraps across lines' : ''),
            sibling_roms: []
          }))
          await new Promise((r) => setTimeout(r, 80))
          return {
            items: items.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 60)),
            total: items.length,
            limit: q.limit ?? 60,
            offset: q.offset ?? 0
          }
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.continue-card').waitFor()
  const recent = await page.locator('.continue-card').getAttribute('data-featured-rom')
  await page.locator('.continue-card').click()
  await page.locator('.game-screen').waitFor()
  await tap(1)
  await page.locator('.continue-card[data-focused="true"]').waitFor()
  assert.equal(await page.locator('.continue-card').getAttribute('data-featured-rom'), recent)
  await page.locator('[data-widget="pick"] [data-action="open-pick"]').waitFor()
  await page.locator('[data-widget="anniversary"] [data-action="open-anniversary"]').waitFor()
  assert.equal(await page.locator('[data-widget="snapshot"]').count(), 0)
  pass('exact last-played feature returns with focus; real discovery widgets replace statistics')
  assert.ok(
    (await page.locator('.library-topbar').evaluate((e) => e.getBoundingClientRect().height)) <= 60
  )
  await page.locator('[data-route="library"]').click()
  await page.locator('.search-prompt').waitFor()
  assert.equal(await page.locator('.library-grid .card').count(), 0)
  assert.equal(
    await page.evaluate(
      () =>
        queries.filter((q) => !q.last_played && !q.favorite && !q.order_by?.includes('created'))
          .length
    ),
    0
  )
  await page.locator('[data-field="library-search"]').fill('a')
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.library-grid .card').count(), 0)
  await page.locator('[data-field="library-search"]').fill('Cave')
  await page.locator('.library-grid .card').first().waitFor()
  await page.locator('[data-field="library-search"]').fill('')
  await page.locator('.search-prompt').waitFor()
  assert.equal(await page.locator('.library-grid .card').count(), 0)
  pass('Search waits for two characters and clears cards when the query is cleared')
  await page.locator('[data-route="collections"]').click()
  await page.locator('[data-collection]').first().waitFor()
  await page.locator('[data-control="collection-kind"] [data-option="virtual"]').click()
  await tap(13)
  assert.ok(
    await focused().getAttribute('data-collection'),
    'Down from collection filters enters the cards'
  )
  for (let i = 0; i < 10; i++) {
    await tap(13)
    await tap(15)
    await tap(14)
    if ((await focused().getAttribute('data-action')) === 'more-collections') await tap(0)
    assert.ok(
      await focused().getAttribute('data-collection'),
      'collection index must keep lateral focus on cards: ' +
        i +
        ' ' +
        (await focused().evaluate((e) => e.outerHTML.slice(0, 500)))
    )
  }
  const id = await focused().getAttribute('data-collection')
  await tap(0)
  await page.locator('.library-grid .card').first().waitFor()
  for (let i = 0; i < 20; i++) {
    await tap(13)
    await tap(15)
    await tap(14)
    assert.ok(await focused().getAttribute('data-rom'), 'game grid must keep focus on cards')
    assert.ok(
      await focused().evaluate((e) => {
        const r = e.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= innerHeight + 2
      }),
      'card stays visible'
    )
  }
  pass('large virtual collection index and paged games keep focus visible through down/right/left')
  await tap(8)
  await tap(8)
  assert.ok(await focused().getAttribute('data-rom'))
  await page.locator('[data-control="layout"] [data-option="list"]').click()
  assert.equal(await focused().getAttribute('data-option'), 'list')
  await tap(13)
  assert.ok(await focused().getAttribute('data-rom'))
  await page.locator('.library-row').first().waitFor()
  await tap(0)
  await page.locator('.game-screen [data-focused="true"]').waitFor()
  await tap(1)
  await page.locator('.library-row[data-focused="true"]').waitFor()
  await tap(1)
  await page.locator(`[data-collection="${id}"][data-focused="true"]`).waitFor()
  pass('Select return and collection Grid/List/details/Back retain the selected item')
  await page.locator('[data-route="systems"]').click()
  await page.locator('[data-control="systems-layout"]').waitFor()
  for (const width of [390, 700, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
  }
  assert.deepEqual(errors, [])
  pass('compact shared controls fit narrow and wide layouts without renderer errors')
} finally {
  await browser.close()
}
