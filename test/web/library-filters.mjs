import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const frames = () =>
  page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))
      )
  )
const tap = async (b, i = 0) => {
  await page.evaluate(
    ([buttonIndex, padIndex]) =>
      (pads[padIndex].buttons[buttonIndex] = { pressed: true, value: 1 }),
    [b, i]
  )
  await frames()
  await page.evaluate(
    ([buttonIndex, padIndex]) =>
      (pads[padIndex].buttons[buttonIndex] = { pressed: false, value: 0 }),
    [b, i]
  )
  await frames()
}
const button = (id) => page.locator(`[data-filter="${id}"]`)
const press = async (id, pad = 0) => {
  await page.mouse.move(0, 0)
  await button(id).hover()
  await tap(0, pad)
}
try {
  await page.addInitScript(() => {
    window.pads = [0, 1].map((index) => ({
      id: 'Filter test ' + index,
      index,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }))
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads })
    window.queries = []
    window.catalogFail = false
    window.queryDelay = 0
    let bridge
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const list = value.library.roms,
          rom = value.library.rom
        let seed
        value.library.filterCatalog = async () => {
          await new Promise((r) => setTimeout(r, 180))
          if (window.catalogFail) throw Error('Options temporarily unavailable')
          return {
            supported: [
              'genres',
              'genres_logic',
              'player_counts',
              'regions',
              'statuses',
              'franchises',
              'collections',
              'publishers',
              'developers',
              'companies',
              'age_ratings',
              'tags',
              'languages',
              'languages_logic',
              'favorite',
              'has_saves',
              'has_states',
              'has_ra',
              'matched',
              'verified',
              'duplicate',
              'missing',
              'physical',
              'playable',
              'has_soundtrack',
              'last_played',
              'hltb_main_story_min',
              'hltb_main_story_max'
            ],
            values: { genres: ['Action', 'Role-playing (RPG)'], languages: ['en', 'fr', 'ja'] }
          }
        }
        value.library.roms = async (q) => {
          queries.push(JSON.parse(JSON.stringify(q)))
          if (!q.filters && !q.platform_ids) return list(q)
          seed ??= (await list({ limit: 1 })).items[0]
          await new Promise((r) => setTimeout(r, window.queryDelay))
          const total = q.filters?.flags?.favorite === false ? 0 : 180
          const items = Array.from({ length: total }, (_, i) => ({
            ...seed,
            id: 90000 + i,
            name: 'Filtered game ' + String(i).padStart(3, '0'),
            name_sort_key: 'filtered ' + i,
            sibling_roms: []
          }))
          return {
            items: items.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 60)),
            total,
            limit: q.limit ?? 60,
            offset: q.offset ?? 0
          }
        }
        value.library.rom = async (id) =>
          id >= 90000 ? { ...seed, id, sibling_roms: [] } : rom(id)
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5274')
  await page.waitForFunction(() => !!window.rommix?.system)
  // Effective Electron viewports after Auto/manual zoom, without the web preview's own zoom.
  await page.evaluate(() => rommix.system.updateSettings({ uiScale: 1 }))
  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-screen [data-rom]').first().waitFor()
  const background = () =>
    page.locator('.library-screen').evaluate((e) => ({
      scroll: e.scrollTop,
      selected: e.dataset.selectedRom,
      platform: document.querySelector('[data-platform-slot=current]')?.textContent
    }))
  for (const layout of ['grid', 'list']) {
    await page.locator(`[data-control=layout] [data-option=${layout}]`).click()
    for (let pad = 0; pad < 2; pad++) {
      await page.locator('.library-screen [data-rom]').nth(20).hover()
      await page.mouse.move(0, 0)
      await button('library-filters').hover()
      await page.waitForTimeout(350) // Let the opener's ordinary page reveal finish.
      const before = await background()
      await tap(0, pad)
      await button('filter-genres').waitFor()
      await tap(13, pad)
      assert.equal(
        await page.locator('.filter-fields [data-focused=true]').count(),
        1,
        `Down must enter filters over populated ${layout}, pad ${pad}`
      )
      const assertIsolated = async () => {
        assert.deepEqual(
          await background(),
          before,
          'Modal navigation must not scroll/select the background'
        )
        assert.equal(await page.locator('.overlay [data-focused=true]').count(), 1)
      }
      await assertIsolated()
      await tap(15, pad)
      await tap(12, pad)
      await assertIsolated()
      await press('filter-genres', pad)
      await button('filter-value-0').waitFor()
      for (const direction of [12, 12, 13, 13, 8, 12]) {
        await tap(direction, pad)
        await assertIsolated()
      }
      await tap(1, pad)
      await tap(7, pad)
      await tap(13, pad)
      for (let i = 0; i < 16; i++) {
        await tap(13, pad)
        await assertIsolated()
      }
      await tap(7, pad)
      await tap(13, pad)
      await tap(15, pad)
      await tap(8, pad)
      await tap(12, pad)
      await tap(5, pad) // Shoulders must not change the platform underneath.
      await assertIsolated()
      await tap(1, pad)
      assert.equal(await button('library-filters').getAttribute('data-focused'), 'true')
      assert.deepEqual(await background(), before)
      console.log(
        `PASS populated platform ${layout}, pad ${pad}: modal focus, nested Back, background scroll/selection isolation`
      )
    }
  }
  await tap(1) // Platform → Systems; root Search is visible again.
  await page.locator('[data-route=library]').click()
  await page.locator('.search-prompt').waitFor()
  for (let pad = 0; pad < 2; pad++) {
    await press('library-filters', pad)
    await press('filter-genres', pad)
    await button('filter-value-0').waitFor()
    await tap(12, pad)
    assert.equal(await page.locator('.filter-logic [data-focused=true]').count(), 1)
    await tap(13, pad)
    assert.equal(await button('filter-value-0').getAttribute('data-focused'), 'true')
    await tap(12, pad)
    await tap(12, pad)
    assert.equal(
      await page.locator('[data-field=filter-value-search][data-focused=true]').count(),
      1
    )
    await tap(13, pad)
    await tap(13, pad)
    assert.equal(await button('filter-value-0').getAttribute('data-focused'), 'true')
    await tap(8, pad)
    assert.equal(await button('filter-done').getAttribute('data-focused'), 'true')
    await tap(12, pad)
    assert.equal(await button('filter-value-0').getAttribute('data-focused'), 'true')
    await tap(0, pad)
    await tap(5, pad) // cannot switch the root section under the modal
    assert.equal(await page.locator('.app').getAttribute('data-screen'), 'library')
    await tap(1, pad)
    await button('filter-genres').waitFor()
    await tap(7, pad)
    assert.equal(
      await page.locator('.filter-panel .tab[data-focused=true]').getAttribute('data-tab'),
      'properties'
    )
    await press('filter-playable-any', pad)
    await tap(15, pad)
    await tap(0, pad)
    assert.equal(await button('filter-playable-yes').getAttribute('aria-pressed'), 'true')
    await tap(15, pad)
    await tap(0, pad)
    assert.equal(await button('filter-playable-no').getAttribute('aria-pressed'), 'true')
    await tap(14, pad)
    await tap(14, pad)
    await tap(0, pad)
    assert.equal(await button('filter-playable-any').getAttribute('aria-pressed'), 'true')
    await tap(8, pad)
    await tap(12, pad)
    assert.equal(await page.locator('.filter-scroll [data-focused=true]').count(), 1)
    await tap(1, pad)
    await page.locator('.overlay').waitFor({ state: 'hidden' })
    assert.equal(await button('library-filters').getAttribute('data-focused'), 'true')
    assert.equal(await page.locator('[data-filter-summary]').count(), 0)
    console.log('PASS pad ' + pad + ' draft cancel, nested B, root isolation and focus return')
  }
  await press('library-filters')
  await press('filter-genres')
  await button('filter-value-0').waitFor()
  await tap(0)
  assert.equal(await button('filter-value-0').getAttribute('aria-pressed'), 'true')
  await press('filter-logic-none')
  await tap(1)
  await tap(8)
  assert.equal(await button('filter-apply').getAttribute('data-focused'), 'true')
  await tap(0)
  await page.locator('.library-screen [data-rom]').first().waitFor()
  assert.equal(await button('library-filters').getAttribute('data-focused'), 'true')
  assert.match(await page.locator('[data-filter-summary]').innerText(), /Exclude.*Action/)
  assert.equal(await page.locator('.search-prompt').count(), 0)
  await tap(13)
  assert.equal(await page.locator('.library-screen [data-rom][data-focused=true]').count(), 1)
  await page.locator('[data-control=layout] [data-option=list]').click()
  const row = page.locator('.library-row').nth(12)
  await row.hover()
  await tap(0, 1)
  await page.locator('.app[data-screen=game]').waitFor()
  await tap(1, 1)
  await page.locator('.library-row[data-focused=true]').waitFor()
  assert.equal(
    await page.locator('.library-row[data-focused=true]').getAttribute('data-rom'),
    '90012'
  )
  assert.match(await page.locator('[data-filter-summary]').innerText(), /Action/)
  console.log('PASS filter-only global browse, List → game → B restores query and exact row')
  await page.locator('.library-row').last().hover()
  await page.waitForFunction(() => queries.some((q) => q.filters && q.offset >= 60))
  assert.equal(
    await page.evaluate(() =>
      queries.filter((q) => q.filters).every((q) => q.filters.facets.genres.logic === 'none')
    ),
    true
  )
  console.log('PASS pagination retains repeated-category logic')
  await press('library-filters')
  await tap(7)
  await press('filter-favorite-no')
  await page.evaluate(() => (queryDelay = 650))
  await press('filter-apply')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.library-row').count(), 0)
  await page.locator('.library-screen .empty').waitFor()
  assert.equal(await page.locator('.library-row').count(), 0)
  await press('library-filters')
  await press('filter-clear')
  await tap(1)
  assert.match(await page.locator('[data-filter-summary]').innerText(), /Favourite: No/)
  await press('library-filters')
  await press('filter-clear')
  await press('filter-apply')
  await page.locator('.search-prompt').waitFor()
  assert.equal(await page.locator('[data-filter-summary]').count(), 0)
  console.log(
    'PASS negative flag, stale-result suppression, empty result and explicit reset/cancel'
  )
  await press('library-filters')
  await tap(6) // Categories → Duration, wraps with LT
  await press('filter-hours-min-plus')
  await press('filter-hours-min-plus')
  await page.locator('[data-field=filter-hours-max]').fill('1')
  await page.keyboard.press('Escape')
  await tap(7) // Invalid range must remain visible/actionable after leaving Duration.
  assert.equal(
    await page.locator('[data-filter-section]').getAttribute('data-filter-section'),
    'categories'
  )
  const beforeRange = await page.evaluate(() => queries.length)
  await press('filter-apply')
  assert.equal(await page.locator('.filter-duration [role=alert]').count(), 1)
  assert.equal(
    await page.locator('[data-field=filter-hours-min]').getAttribute('data-focused'),
    'true',
    await page
      .locator('[data-focused=true]')
      .evaluateAll((es) => es.map((e) => e.outerHTML).join('\n'))
  )
  assert.equal(await page.evaluate(() => queries.length), beforeRange)
  await page.locator('[data-field=filter-hours-max]').fill('2.5')
  await page.keyboard.press('Escape')
  await press('filter-apply')
  await page.locator('.library-screen [data-rom]').first().waitFor()
  assert.deepEqual(await page.evaluate(() => queries.at(-1).filters.duration), {
    minHours: 2,
    maxHours: 2.5
  })
  await press('library-filters')
  await press('filter-clear')
  await press('filter-apply')
  await page.locator('.search-prompt').waitFor()
  console.log(
    'PASS explicit property tri-states and validated From/To with steppers and fractional hours'
  )
  await page.evaluate(() => (catalogFail = true))
  await press('library-filters')
  await button('filter-retry').waitFor()
  await page.evaluate(() => (catalogFail = false))
  await press('filter-retry')
  await button('filter-genres').waitFor()
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/filters-panel.png' })
  for (const viewport of [
    { width: 960, height: 540 },
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 }
  ]) {
    await page.setViewportSize(viewport)
    let geometry
    for (const section of ['categories', 'properties', 'duration']) {
      await page.locator(`.filter-panel [data-tab="${section}"]`).click()
      assert.equal(
        await page.locator('.filter-panel .tab[data-focused=true]').getAttribute('data-tab'),
        section
      )
      const rect = await page.locator('.overlay__panel').evaluate((e) => {
        const r = e.getBoundingClientRect()
        return { y: r.y, height: r.height }
      })
      if (geometry) assert.deepEqual(rect, geometry, 'Tab change must not resize the dialog')
      geometry = rect
      assert.equal(
        await button('filter-apply').evaluate((e) => {
          const r = e.getBoundingClientRect()
          return r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
        }),
        true
      )
      assert.equal(
        await page.locator('.filter-panel').evaluate((e) => e.scrollWidth <= e.clientWidth),
        true
      )
      if (section === 'properties') {
        assert.equal(await page.locator('.filter-property').count(), 12)
        const labels = await page.locator('.filter-property > span').evaluateAll((elements) =>
          elements.every((e) => {
            const s = getComputedStyle(e),
              r = e.getBoundingClientRect(),
              controls = e.nextElementSibling.getBoundingClientRect()
            return (
              s.clipPath === 'none' &&
              s.display !== 'none' &&
              r.width > 40 &&
              r.height > 12 &&
              r.right < controls.left &&
              !!e.textContent.trim()
            )
          })
        )
        assert.equal(labels, true, 'Every property must have a visible, non-overlapping label')
        await tap(13)
        assert.equal(await page.locator('.filter-property [data-focused=true]').count(), 1)
        for (let i = 0; i < 11; i++) await tap(13)
        assert.equal(
          await page.locator('[data-focused=true]').evaluate((e) => {
            const r = e.getBoundingClientRect()
            return r.top >= 0 && r.bottom <= innerHeight
          }),
          true
        )
        if (process.env.SCREENSHOT_DIR && viewport.width === 1600)
          await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/filters-properties.png' })
      }
    }
  }
  await page.setViewportSize({ width: 1600, height: 900 })
  await tap(7) // Duration → Categories
  console.log(
    'PASS stable tabs, visible property labels and focus/footers at five effective UI scales'
  )
  await press('filter-genres')
  await button('filter-value-0').waitFor()
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/filters-values.png' })
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport)
    const fit = await button('filter-done').evaluate((e) => {
      const r = e.getBoundingClientRect()
      return r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
    })
    assert.equal(fit, true)
  }
  assert.deepEqual(errors, [])
  console.log('PASS retry and modal footer visibility at 720p/1080p; no browser errors')
} finally {
  await browser.close()
}
