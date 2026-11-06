// Real layout + W3C gamepad polling. Only the labelled public demo bridge is allowed.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'chrome',
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const pad = async (button, pressed) =>
  page.evaluate(
    ({ button: index, pressed: down }) => {
      window.testPad.buttons[index] = { pressed: down, touched: down, value: down ? 1 : 0 }
    },
    { button, pressed }
  )
const tap = async (button) => {
  await pad(button, true)
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
  await pad(button, false)
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
}
const focusedId = async () =>
  Number(
    await page.locator('[data-focus-collection] [data-focused="true"]').getAttribute('data-rom')
  )
const openGrid = async () => {
  if (await page.locator('.platform-carousel').count()) await tap(1)
  await page.locator('[data-route="systems"]').click()
  await page.locator('[data-system]').first().click()
  if (await page.locator('.library-screen[data-layout="list"]').count())
    await page.locator('[data-control="layout"] [data-option="grid"]').click()
  await page.locator('.library-grid .card').first().waitFor()
}
const startAtFirst = async () => {
  await page.locator('.library-grid .card, .library-row').first().hover()
  await page.mouse.move(0, 0)
  await page.waitForTimeout(350)
}
const beginRecording = async () =>
  page.evaluate(() => {
    window.navSamples = []
    window.navRecording = true
    const record = () => {
      if (!window.navRecording) return
      const e = document.querySelector('[data-focused="true"]')
      const box = e?.getBoundingClientRect()
      const list = document.querySelector('.library-rows')
      const viewport = (list ?? document.querySelector('.library-screen')).getBoundingClientRect()
      window.navSamples.push({
        id: Number(e?.dataset.rom),
        top: box?.top,
        bottom: box?.bottom,
        min: viewport.top,
        max: Math.min(viewport.bottom, innerHeight - 45)
      })
      requestAnimationFrame(record)
    }
    requestAnimationFrame(record)
  })
const finishRecording = async () =>
  page.evaluate(() => {
    window.navRecording = false
    return window.navSamples
  })
const verifyRun = (samples, step) => {
  assert.ok(samples.length > 20)
  for (const sample of samples) {
    assert.ok(sample.id >= 10000, `Focus escaped the games: ${JSON.stringify(sample)}`)
    assert.ok(
      sample.top >= sample.min - 2 && sample.bottom <= sample.max + 2,
      `Selected game left viewport: ${JSON.stringify(sample)}`
    )
  }
  const ids = samples.map((s) => s.id).filter((id, i, a) => i === 0 || id !== a[i - 1])
  assert.ok(ids.length >= 10, `Held direction must continue through paging: ${ids}`)
  for (let i = 1; i < ids.length; i++)
    assert.equal(ids[i] - ids[i - 1], step, 'One move must reach the adjacent row')
}
try {
  await page.addInitScript(() => {
    window.testPad = {
      id: 'Navigation fixture',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.topbar').waitFor()
  assert.match(await page.title(), /demo/i)
  await page.evaluate(async () => {
    const seed = (await rommix.library.roms({ limit: 1 })).items[0]
    const items = Array.from({ length: 1500 }, (_, i) => ({
      ...seed,
      id: 10000 + i,
      name: `${String.fromCharCode(65 + Math.floor(i / 60))} Fixture ${String(i).padStart(4, '0')}`,
      sibling_roms: []
    }))
    window.navQueries = []
    const rom = rommix.library.rom
    rommix.library.rom = async (id) => items.find((r) => r.id === id) ?? rom(id)
    rommix.library.roms = async (query) => {
      window.navQueries.push(query)
      const ordered = query.order_dir === 'desc' ? items.toReversed() : items
      const offset = query.offset ?? 0,
        limit = query.limit ?? 60
      await new Promise((resolve) => setTimeout(resolve, 450))
      return { items: ordered.slice(offset, offset + limit), offset, limit, total: items.length }
    }
  })
  await openGrid()
  await page.locator('.library-grid .card[data-rom="10000"][data-focused="true"]').waitFor()
  console.log('PASS entering a system starts on its first game, without a pointer move')
  await page.waitForFunction(() => window.navQueries.some((q) => q.offset === 60))
  await tap(13)
  await tap(12)
  assert.equal(await focusedId(), 10000)
  await tap(12)
  assert.equal(await page.locator('.library-toolbar [data-focused="true"]').count(), 1)
  await tap(13)
  assert.equal(await focusedId(), 10000)
  console.log(
    'PASS next metadata page starts ahead of focus; Up/Down crosses the toolbar without skipping games'
  )
  await page.locator('[data-control="layout"] [data-option="list"]').hover()
  await tap(0)
  await page.locator('.library-row').first().waitFor()
  assert.equal(
    await page.locator('[data-control="layout"] [data-option="list"][data-focused="true"]').count(),
    1,
    'Changing view must keep focus on the control that was activated'
  )
  await tap(13)
  await page.locator('.library-row[data-focused="true"]').waitFor()
  assert.equal(
    await focusedId(),
    10000,
    'Down from the toolbar enters the remembered game without scrolling to the end'
  )
  await page.locator('[data-control="layout"] [data-option="grid"]').hover()
  await tap(0)
  assert.equal(
    await page.locator('[data-control="layout"] [data-option="grid"][data-focused="true"]').count(),
    1
  )
  await tap(13)
  assert.equal(await focusedId(), 10000)
  console.log('PASS pad-operated view controls keep focus; Down returns to games')
  for (const size of ['small', 'medium', 'large']) {
    await page.locator(`[data-control="cover-size"] [data-option="${size}"]`).click()
    await startAtFirst()
    const columns = await page
      .locator('.library-grid')
      .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)
    const first = await focusedId()
    await tap(13)
    assert.equal(await focusedId(), first + columns)
    await tap(15)
    assert.equal(await focusedId(), first + columns + 1)
    await tap(14)
    assert.equal(await focusedId(), first + columns)
    assert.equal(
      await page.locator('.library-letter').count(),
      0,
      'Deliberate taps must not obscure covers'
    )
    await beginRecording()
    await pad(13, true)
    await page.waitForTimeout(2300)
    await page.locator('.library-letter').waitFor()
    assert.equal(
      await page.locator('.library-letter').innerText(),
      await page
        .locator('.card[data-focused="true"]')
        .getAttribute('data-focus-label')
        .then((s) => s[0])
    )
    await pad(13, false)
    verifyRun(await finishRecording(), columns)
    await page.waitForTimeout(900)
    assert.equal(await page.locator('.library-letter').count(), 0)
    const before = await focusedId()
    await tap(15)
    assert.equal(await focusedId(), before + 1, 'Right after a fast vertical run stays in its row')
    await pad(15, true)
    await page.waitForFunction(
      (count) =>
        (Number(document.querySelector('.card[data-focused="true"]')?.dataset.rom) - 10000) %
          count ===
        count - 1,
      columns
    )
    await page.waitForTimeout(250)
    await pad(15, false)
    assert.equal(((await focusedId()) - 10000) % columns, columns - 1, 'Right edge holds position')
    assert.equal(
      await page.locator('.library-letter').count(),
      0,
      'Horizontal browsing must not show a letter'
    )
    console.log('PASS held direction, paging, visible focus and horizontal boundary:', size)
  }
  await page.locator('[data-control="grouping"] [data-option="letter"]').click()
  assert.ok((await page.locator('.library-letter-heading').count()) > 1)
  await page.locator('.library-grid .card').first().hover()
  await page.mouse.move(0, 0)
  // Incomplete letter rows must not send a horizontal press into the next section.
  const end = page.locator('.card[data-rom="10059"]')
  await end.hover()
  await page.mouse.move(0, 0)
  await tap(15)
  assert.equal(await focusedId(), 10059)
  await tap(13)
  assert.ok((await focusedId()) >= 10060 && (await focusedId()) < 10070)
  console.log('PASS alphabetical sections retain row boundaries')
  await page.locator('[data-control="sort"] [data-option="desc"]').click()
  await page.locator('.library-grid .card[data-rom="11499"]').waitFor()
  assert.equal(
    await page.locator('[data-control="sort"] [data-option="desc"][data-focused="true"]').count(),
    1,
    'Asynchronous sorting must not steal focus from the chosen control'
  )
  assert.equal(await page.locator('.library-letter-heading').first().innerText(), 'Y')
  assert.ok(
    await page.evaluate(() =>
      window.navQueries.some(
        (q) => q.order_by === 'name' && q.order_dir === 'desc' && q.offset === 0
      )
    )
  )
  await page.locator('[data-control="layout"] [data-option="list"]').click()
  await page.locator('.library-row').first().waitFor()
  assert.equal(await page.locator('.library-row').first().getAttribute('data-rom'), '11499')
  await page.locator('[data-control="grouping"] [data-option="none"]').click()
  await page.locator('[data-control="sort"] [data-option="asc"]').click()
  await page.locator('.library-row[data-rom="10000"]').waitFor()
  await startAtFirst()
  await beginRecording()
  await pad(13, true)
  await page.waitForTimeout(2300)
  await pad(13, false)
  verifyRun(await finishRecording(), 1)
  await tap(0)
  await page.locator('.game-screen [data-focused="true"]').waitFor()
  await tap(1)
  await page.locator('.library-row[data-focused="true"]').waitFor()
  console.log(
    'PASS descending order queries the entire library; list holds visible selection and returns from details'
  )
  for (const width of [1280, 700, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await openGrid()
    await startAtFirst()
    await tap(13)
    await tap(12)
    assert.equal(await focusedId(), 10000)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }
  assert.deepEqual(errors, [])
  console.log('PASS responsive navigation; no renderer errors')
} finally {
  await browser.close()
}
