import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const frames = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
const tap = async (button) => {
  await page.evaluate((i) => {
    pad.buttons[i] = { pressed: true, value: 1 }
  }, button)
  await frames()
  await page.evaluate((i) => {
    pad.buttons[i] = { pressed: false, value: 0 }
  }, button)
  await frames()
}
const capture = async (name) => {
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` })
}
try {
  await page.addInitScript(() => {
    localStorage.setItem('rommix.library.presentation', JSON.stringify({ layout: 'list' }))
    window.pad = {
      id: 'Table fixture',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  assert.match(await page.title(), /demo/i)
  await page.locator('.continue-card__cover').waitFor()
  const featured = await page.locator('.continue-card').boundingBox()
  const cover = await page.locator('.continue-card__cover').boundingBox()
  assert.ok(featured.height < 350 && cover.width >= 231)
  await capture('table-home')
  console.log('PASS smaller Last Played frame contains a larger cover')

  await page.locator('[data-route=library]').click()
  await page.locator('.search-prompt').waitFor()
  const search = page.locator('[data-field=library-search]')
  for (const term of ['', 'h']) {
    await search.fill(term)
    await frames()
    assert.equal(await page.locator('.search-prompt:visible').count(), 1)
    assert.equal(
      await page
        .locator('.library-layout,.library-screen .empty,.library-heading .page-subtitle')
        .count(),
      0
    )
  }
  await capture('table-search-empty')
  await search.fill('No matching public fixture 981235')
  await page.locator('.library-rows .empty').waitFor()
  assert.equal(await page.locator('.search-prompt').count(), 0)
  await search.fill('')
  await page.locator('.search-prompt').waitFor()
  assert.equal(await page.locator('.library-screen .empty').count(), 0)
  console.log(
    'PASS remembered List has one search prompt; no-match state only follows a real query'
  )

  const fixture = await page.evaluate(async () => {
    const roms = await rommix.library.roms({ limit: 1000, group_by_meta_id: true })
    const game = roms.items.find((r) => r.sibling_roms.length) ?? roms.items[0]
    window.detailReads = 0
    const rom = rommix.library.rom
    rommix.library.rom = async (id) => {
      detailReads++
      return rom(id)
    }
    return game
  })
  await page.locator('[data-route=systems]').click()
  await page.locator(`[data-system="${fixture.platform_id}"]`).click()
  const row = page.locator(`.library-row[data-rom="${fixture.id}"]`)
  await row.waitFor()
  assert.equal(await page.locator('.library-detail').count(), 0)
  assert.equal(await row.locator('.library-row__filename').textContent(), fixture.fs_name)
  assert.equal(await row.locator('[data-column]').count(), 7)
  const header = await page.locator('.library-table-header').boundingBox()
  assert.ok(header.width > 1400)
  await row.hover()
  await page.mouse.move(0, 0)
  await tap(13)
  await tap(12)
  assert.equal(
    await page.evaluate(() => detailReads),
    0,
    'Browsing must not load hidden game screens'
  )
  await capture('table-library')
  for (const [slot, alignment] of [
    ['previous', 'left'],
    ['next', 'right']
  ]) {
    assert.equal(
      await page
        .locator(`.platform-carousel__${slot} .platform-carousel__name`)
        .evaluate((e) => getComputedStyle(e).textAlign),
      alignment
    )
  }
  await row.click()
  await page.locator('.game-screen .game-hero').waitFor()
  assert.equal(await page.locator('.library-screen,.platform-carousel,.library-topbar').count(), 0)
  assert.ok(await page.locator('.game-screen [data-action]').count())
  await tap(1)
  await page.locator(`.library-row[data-rom="${fixture.id}"][data-focused=true]`).waitFor()
  console.log(
    'PASS RomM-style table shows file/metadata, reads details only on Open and restores the exact row'
  )

  for (const width of [390, 700, 950, 1250, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await frames()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    const fits = await page
      .locator('.library-row')
      .first()
      .evaluate((e) => {
        const bounds = e.getBoundingClientRect()
        return [...e.children]
          .filter((n) => n.getBoundingClientRect().width)
          .every((n) => n.getBoundingClientRect().right <= bounds.right + 1)
      })
    assert.ok(fits, `Columns overflow at ${width}`)
    const rowBox = await page.locator('.library-row[data-focused=true]').boundingBox()
    assert.ok(rowBox.y >= header.y && rowBox.y + rowBox.height < 850)
  }
  assert.deepEqual(errors, [])
  console.log('PASS table columns fit narrow/wide layouts while selected rows remain visible')
} finally {
  await browser.close()
}
