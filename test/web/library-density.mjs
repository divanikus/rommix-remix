import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const frames = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
const tap = async (button) => {
  await page.evaluate((n) => {
    pad.buttons[n] = { pressed: true, value: 1 }
  }, button)
  await frames()
  await page.evaluate((n) => {
    pad.buttons[n] = { pressed: false, value: 0 }
  }, button)
  await frames()
}
const focused = () => page.locator('[data-focused="true"]').last()
const focusRom = async (id) => {
  await page.locator(`[data-rom="${id}"]`).hover()
  await page.mouse.move(0, 0)
  await frames()
}
try {
  await page.addInitScript(() => {
    window.pad = {
      id: 'Density fixture',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.continue-card').waitFor()
  assert.match(await page.title(), /demo/i)
  await page.evaluate(async () => {
    const list = rommix.library.roms,
      rom = rommix.library.rom
    const seed = (await list({ limit: 1 })).items[0]
    const items = Array.from({ length: 150 }, (_, i) => {
      const letter = i < 17 ? 'A' : i < 40 ? 'B' : i < 69 ? 'C' : 'D'
      return {
        ...seed,
        id: 300000 + i,
        name: `${letter} Fixture ${i}`,
        name_sort_key: `${letter.toLowerCase()} ${i}`,
        sibling_roms: []
      }
    })
    rommix.library.rom = async (id) => items.find((r) => r.id === id) ?? rom(id)
    rommix.library.roms = async (query) => {
      if (!query.platform_ids?.length) return list(query)
      const offset = query.offset ?? 0,
        limit = query.limit ?? 60
      return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
    }
    const platforms = await rommix.library.platforms()
    rommix.library.platforms = async () =>
      platforms.map((p, i) => ({
        ...p,
        display_name:
          i === 0
            ? 'A'
            : i === 1
              ? 'B platform with an exceptionally long name that must never resize the carousel'
              : `${String.fromCharCode(65 + i)} ${p.display_name}`
      }))
  })
  await page.locator('[data-route="systems"]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('[data-control="cover-size"] [data-option="medium"]').click()
  await page.locator('[data-control="grouping"] [data-option="letter"]').click()
  for (const width of [1280, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await frames()
    const rows = await page.locator('.library-grid .card').evaluateAll((cards) => {
      const measuredRows = []
      for (const card of cards) {
        const rect = card.getBoundingClientRect(),
          item = { id: Number(card.dataset.rom), x: rect.x, y: rect.y, width: rect.width }
        const row = measuredRows.find((r) => Math.abs(r[0].y - item.y) < 3)
        if (row) row.push(item)
        else measuredRows.push([item])
      }
      return measuredRows
    })
    const tail = rows.findIndex((row) => row.at(-1).id === 300016)
    const previous = rows[tail - 1],
      short = rows[tail],
      next = rows[tail + 1]
    assert.ok(previous.length > short.length && next.length > short.length)
    await focusRom(previous.at(-1).id)
    await tap(13)
    assert.equal(Number(await focused().getAttribute('data-rom')), short.at(-1).id)
    await tap(13)
    assert.equal(
      Number(await focused().getAttribute('data-rom')),
      next[short.length - 1].id,
      'Down after a short letter row continues from the visible column, not a hidden old anchor'
    )
    await tap(12)
    assert.equal(Number(await focused().getAttribute('data-rom')), short.at(-1).id)
  }
  console.log('PASS ABC short rows keep the visible column across headings at three grid widths')
  await page.setViewportSize({ width: 1600, height: 900 })
  await tap(1)
  await page.locator('.systems-screen').waitFor()
  const system = await page.locator('[data-system]').first().boundingBox()
  assert.ok(system.width < 176 && system.height < 210, JSON.stringify(system))
  assert.equal(await page.locator('[data-control="cover-size"] [data-option="compact"]').count(), 0)
  await page.locator('[data-system]').first().click()
  const density = []
  for (const size of ['small', 'medium', 'large']) {
    await page.locator(`[data-control="cover-size"] [data-option="${size}"]`).click()
    density.push(
      await page
        .locator('.library-grid')
        .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)
    )
  }
  assert.ok(density[0] > density[1] && density[1] > density[2])
  console.log('PASS three smaller presets and denser Ludo-style system cards')
  await page.evaluate(() => {
    window.samples = []
    window.recording = true
    const record = () => {
      const el = document.querySelector('.platform-carousel'),
        slot = document.querySelector('[data-platform-slot=current]'),
        name = slot.querySelector('span')
      const r = el.getBoundingClientRect(),
        s = slot.getBoundingClientRect()
      samples.push({
        x: r.x,
        width: r.width,
        height: r.height,
        center: s.x + s.width / 2,
        transform: getComputedStyle(name).transform,
        animations: el.getAnimations({ subtree: true }).length
      })
      if (recording) requestAnimationFrame(record)
    }
    record()
  })
  await focusRom(300000)
  for (const button of [5, 5, 4, 4]) {
    await tap(button)
    await frames()
  }
  const samples = await page.evaluate(() => {
    recording = false
    return samples
  })
  const base = samples[0]
  assert.ok(samples.length > 20)
  for (const sample of samples) {
    assert.ok(
      Math.abs(sample.center - base.center) < 1 && Math.abs(sample.height - base.height) < 1
    )
    assert.equal(sample.transform, 'none')
    assert.equal(sample.animations, 0)
  }
  console.log('PASS carousel bounds and center remain fixed across short/long platform names')
  await focusRom(300000)
  await tap(0)
  await page.locator('.game-screen [data-tab]').first().waitFor()
  assert.equal(await page.locator('.topbar').count(), 0)
  const tab = await page.locator('[data-tab][data-active=true]').getAttribute('data-tab')
  await tap(5)
  assert.notEqual(await page.locator('[data-tab][data-active=true]').getAttribute('data-tab'), tab)
  await tap(1)
  await page.locator('.library-grid').waitFor()
  await page.locator('[data-control="layout"] [data-option="list"]').click()
  await tap(13)
  await tap(0)
  await page.locator('.game-screen [data-focused=true]').waitFor()
  assert.equal(await page.locator('.platform-carousel').isVisible(), false)
  await tap(1)
  assert.equal(await page.locator('.platform-carousel').isVisible(), true)
  assert.equal(Number(await focused().getAttribute('data-rom')), 300000)
  console.log(
    'PASS both grid and table open a standalone card without competing headers; Back restores exact game'
  )
  await tap(1)
  await page.locator('[data-route=home]').click()
  await page.locator('.continue-card__cover').waitFor()
  assert.ok((await page.locator('.continue-card__cover').boundingBox()).width >= 190)
  for (const width of [390, 700, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await frames()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    await page.locator('[data-route=systems]').click()
    await page.locator('[data-system]').first().waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    await page.locator('[data-route=home]').click()
  }
  assert.deepEqual(errors, [])
  console.log('PASS larger featured cover and denser cards fit narrow/wide viewports')
} finally {
  await browser.close()
}
