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
const tap = async (button, index = 0) => {
  await page.evaluate(
    ([b, i]) => {
      pads[i].buttons[b] = { pressed: true, value: 1 }
    },
    [button, index]
  )
  await frames()
  await page.evaluate(
    ([b, i]) => {
      pads[i].buttons[b] = { pressed: false, value: 0 }
    },
    [button, index]
  )
  await frames()
}
const screen = (name) => page.locator(`.app[data-screen=${name}]`).waitFor()
const menu = async (route, pad = 0) => {
  await tap(9, pad)
  await page.locator(`[data-action=open-${route}]`).click()
  await screen(route)
}
const capture = async (name) => {
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` })
}
const order = ['settings', 'emulators', 'bios', 'downloads']
const checkSlots = async (route) => {
  assert.deepEqual(
    await page
      .locator('[data-utility-route]')
      .evaluateAll((es) => es.map((e) => e.dataset.utilityRoute)),
    order
  )
  assert.equal(
    await page.locator('[data-utility-route][data-active=true]').getAttribute('data-utility-route'),
    route
  )
  assert.equal((await page.locator('.app-header').boundingBox()).height, 58)
  assert.equal(await page.locator('.app-header').count(), 1)
}
try {
  await page.addInitScript(() => {
    window.pads = ['First pad', 'Second pad'].map((id, index) => ({
      id,
      index,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }))
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  assert.match(await page.title(), /demo/i)
  await page.locator('.continue-card').waitFor()
  for (let pad = 0; pad < 2; pad++) {
    await menu('settings', pad)
    for (const direction of [5, 4]) {
      let index = 0
      for (let step = 0; step < 8; step++) {
        const route = order[index]
        await checkSlots(route)
        // Enter content before switching: utility shoulders must not depend on header focus.
        if (route === 'settings') await page.locator('[data-tab=general]').click()
        else if (route === 'downloads') await page.locator('[data-tab=activity]').click()
        else await page.locator('.group__header').first().click()
        await page.locator('.content').evaluate((e) => {
          e.scrollTop = e.scrollHeight
        })
        await tap(direction, pad)
        index = (index + (direction === 5 ? 1 : 3)) % 4
        await screen(order[index])
        await page.locator(`[data-utility-route=${order[index]}][data-focused=true]`).waitFor()
      }
    }
    await tap(1, pad)
    await screen('home')
  }
  console.log(
    'PASS both pads cycle all utility peers from deep content with header focus; one B restores Home'
  )

  for (let pad = 0; pad < 2; pad++) {
    await menu('settings', pad)
    for (const tab of ['games', 'system', 'general']) {
      await tap(7, pad)
      await page.locator(`[data-tab=${tab}][data-active=true][data-focused=true]`).waitFor()
      await screen('settings')
    }
    await tap(6, pad)
    await page.locator('[data-tab=system][data-active=true]').waitFor()
    await tap(4, pad)
    await screen('downloads')
    await page.locator('[data-tab=activity][data-active=true]').waitFor()
    await tap(7, pad)
    await page.locator('[data-tab=device][data-active=true][data-focused=true]').waitFor()
    await tap(6, pad)
    await page.locator('[data-tab=activity][data-active=true]').waitFor()
    await tap(5, pad)
    await screen('settings')
    await tap(1, pad)
    await screen('home')
  }
  console.log(
    'PASS triggers own Settings/Downloads tabs, shoulders own utility sections, with visible focus'
  )

  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-grid .card').first().waitFor()
  const picked = await page.locator('.library-grid .card').first().getAttribute('data-rom')
  await page.locator('.library-grid .card').first().click()
  await screen('game')
  await menu('bios')
  await tap(5)
  await screen('downloads')
  await tap(5)
  await screen('settings')
  await tap(1)
  await screen('game')
  await tap(1)
  await page.locator(`.card[data-rom="${picked}"][data-focused=true]`).waitFor()
  await tap(1)
  await screen('systems')
  await page.locator('[data-route=home]').click()
  console.log('PASS cycling retains game/library origin and restores the selected game after Back')

  await menu('settings')
  await tap(9)
  await page.locator('.overlay--menu').waitFor()
  await tap(5)
  await tap(7)
  await screen('settings')
  await tap(1)
  await page.locator('[data-tab=general][data-active=true]').waitFor()
  await page.locator('[data-utility-route=emulators]').click()
  await screen('emulators')
  await page.locator('[data-utility-route=settings]').click()
  await screen('settings')
  assert.equal(await page.locator('.settings-screen > .panel').count(), 0)
  assert.equal(await page.locator('.tabs--utility .tab').count(), 3)
  await capture('utility-sections-settings')
  console.log(
    'PASS menu traps shoulder/trigger input; section clicks work; Settings uses unframed tabs'
  )

  for (const theme of ['midnight', 'daylight', 'c64']) {
    await page.evaluate((name) => {
      document.documentElement.dataset.theme = name
    }, theme)
    for (const width of [390, 950, 1600, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await frames()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
      const slots = await page.locator('[data-utility-route]').evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect()
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        })
      )
      assert.ok(
        slots.every(
          (r, i) =>
            r.left >= 0 &&
            r.right <= width &&
            r.top >= 0 &&
            r.bottom <= 58 &&
            (i === 0 || r.left >= slots[i - 1].right)
        )
      )
    }
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS utility carousel fits stable header slots across themes and narrow/wide screens'
  )
} finally {
  await browser.close()
}
