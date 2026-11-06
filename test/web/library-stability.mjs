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
const tap = async (n) => {
  await page.evaluate((i) => (pad.buttons[i] = { pressed: true, value: 1 }), n)
  await frames()
  await page.evaluate((i) => (pad.buttons[i] = { pressed: false, value: 0 }), n)
  await frames()
}
try {
  await page.addInitScript(() => {
    window.pad = {
      id: 'Stability fixture',
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
        const random = value.library.randomRom,
          platforms = value.library.platforms
        let sequence = 0
        const variant = async (long) => ({
          ...(await random()),
          name: long ? 'A very long game title with enough words to fill several lines' : 'A',
          platform_display_name: long
            ? 'A very long platform name with multiple lines of descriptive text'
            : 'B',
          regions: [long ? 'An exceptionally long regional description' : 'US'],
          ...(!long ? { path_cover_small: null, path_cover_large: null } : {}),
          metadatum: { first_release_date: '2000-01-01' }
        })
        value.library.randomRom = async () => {
          await new Promise((r) => setTimeout(r, 120))
          if (window.failPick) throw Error('Fixture failure')
          return variant(++sequence % 2 === 0)
        }
        value.library.anniversaries = async () => ({
          items: await Promise.all([variant(false), variant(true)]),
          total: 2
        })
        value.library.platforms = async () =>
          (await platforms()).map((p, i) => ({
            ...p,
            display_name:
              i === 0
                ? 'A'
                : i === 1
                  ? 'B a very long platform name that should never move a bumper'
                  : `${String.fromCharCode(65 + i)} ${p.display_name}`,
            generation: i === 0 ? -1 : i === 1 ? 0 : i === 2 ? null : i === 3 ? 10 : 2
          }))
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  assert.match(await page.title(), /demo/i)
  await page.locator('[data-widget=pick][aria-busy=false] [data-action=open-pick]').waitFor()
  await page
    .locator('[data-widget=anniversary][aria-busy=false] [data-action=open-anniversary]')
    .waitFor()
  await page.locator('.continue-card').waitFor()
  await page.evaluate(() => {
    window.samples = []
    window.recording = true
    const record = () => {
      samples.push(
        [...document.querySelectorAll('.home-featured,.continue-card,[data-widget]')].map((e) => {
          const r = e.getBoundingClientRect()
          return [r.x, r.y, r.width, r.height]
        })
      )
      if (recording) requestAnimationFrame(record)
    }
    record()
  })
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-action=pick-again]').click()
    await page.locator('[data-widget=pick][aria-busy=true]').waitFor()
    await page.locator('[data-widget=pick][aria-busy=false]').waitFor()
    await page.locator(`[data-action=anniversary-${i % 2 === 0 ? 'next' : 'previous'}]`).click()
  }
  await page.evaluate(() => {
    window.failPick = true
  })
  await page.locator('[data-action=pick-again]').click()
  await page.locator('[data-widget=pick] [role=status]').waitFor()
  const samples = await page.evaluate(() => {
    recording = false
    return samples
  })
  for (const sample of samples)
    for (let i = 0; i < sample.length; i++)
      for (let j = 0; j < 4; j++)
        assert.ok(
          Math.abs(sample[i][j] - samples[0][i][j]) < 1,
          `Featured row moved: ${JSON.stringify(sample)}`
        )
  for (const art of await page.locator('.home-widget__art').all())
    assert.ok((await art.boundingBox()).width >= 79)
  console.log(
    'PASS large discovery art and fixed Home geometry through short/long titles, loading, missing art and errors'
  )
  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-grid .card[data-focused=true]').waitFor()
  await tap(5)
  await page.locator('.library-grid .card[data-focused=true]').waitFor()
  await page.evaluate(() => {
    window.samples = []
    window.recording = true
    const record = () => {
      samples.push(
        [
          ...document.querySelectorAll(
            '.platform-carousel [data-platform-slot],.platform-carousel__name,.platform-carousel .hint__key'
          )
        ].map((e) => {
          const r = e.getBoundingClientRect()
          return [r.x, r.y, r.width, r.height]
        })
      )
      if (recording) requestAnimationFrame(record)
    }
    record()
  })
  for (const n of [5, 5, 4, 4, 5, 4]) {
    await tap(n)
    await frames()
  }
  const carousel = await page.evaluate(() => {
    recording = false
    return samples
  })
  assert.equal(carousel[0].length, 8)
  for (const sample of carousel)
    for (let i = 0; i < sample.length; i++)
      for (let j = 0; j < 4; j++)
        assert.ok(
          Math.abs(sample[i][j] - carousel[0][i][j]) < 1,
          `Inner carousel element moved: ${JSON.stringify(sample)}`
        )
  console.log(
    'PASS bumper and name-slot coordinates remain fixed across platform changes, not just the outer carousel'
  )
  await tap(1)
  await page.locator('[data-system]').first().waitFor()
  await page.locator('[data-control=systems-group] [data-option=generation]').click()
  await page.locator('.systems-heading').first().waitFor()
  for (const direction of ['asc', 'desc']) {
    await page.locator(`[data-control=systems-direction] [data-option=${direction}]`).click()
    await frames()
    assert.deepEqual(await page.locator('.systems-heading').allTextContents(), [
      'Generation 2',
      'Generation 10',
      'Unknown generation'
    ])
    const unknown = await page.locator('.systems-grid').evaluate((e) => {
      let heading = ''
      return [...e.children].flatMap((n) => {
        if (n.matches('h2')) heading = n.textContent
        return n.matches('[data-system]') && heading === 'Unknown generation'
          ? [n.querySelector('.system-tile__name').textContent]
          : []
      })
    })
    assert.equal(unknown.length, 3)
    assert.ok(unknown.includes('A'))
  }
  console.log(
    'PASS negative/zero/null generations form the final unknown group in both sort directions'
  )
  for (const width of [390, 700, 1000, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.locator('[data-route=home]').click()
    await page.locator('[data-widget=anniversary] .home-widget__footer').waitFor()
    await frames()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    assert.ok(
      await page
        .locator('[data-widget=anniversary]')
        .evaluate((e) =>
          [...e.children].every(
            (c) => c.getBoundingClientRect().bottom <= e.getBoundingClientRect().bottom + 1
          )
        )
    )
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS discovery controls and counters fit narrow/wide layouts without renderer errors'
  )
} finally {
  await browser.close()
}
