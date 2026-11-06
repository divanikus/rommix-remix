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
    let bridge
    window.virtualCalls = 0
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        for (const name of ['collections', 'virtualCollections', 'platforms']) {
          const original = value.library[name]
          value.library[name] = async (...args) => {
            if (name === 'virtualCollections') virtualCalls++
            await new Promise((r) => setTimeout(r, 250))
            return original(...args)
          }
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5274/')
  assert.match(await page.title(), /demo/i)
  await page.locator('.continue-card').waitFor()
  await page.locator('[data-shelf=collections] [data-collection]').first().waitFor()
  assert.equal(await page.locator('[data-shelf=virtual-collections]').count(), 0)
  assert.equal(await page.evaluate(() => virtualCalls), 0)
  console.log('PASS Home neither requests nor renders virtual collections')

  for (let pad = 0; pad < 2; pad++) {
    for (const route of ['systems', 'collections', 'library', 'home']) {
      const nav = page.locator(`[data-route=${route}]`)
      await nav.hover()
      await tap(0, pad)
      await screen(route)
      if (route === 'systems') await page.locator('[data-system]').first().waitFor()
      if (route === 'collections') await page.locator('[data-collection]').first().waitFor()
      if (route === 'home') await page.locator('.continue-card').waitFor()
      await frames()
      assert.equal(
        await nav.getAttribute('data-focused'),
        'true',
        route + ' retains header focus after loading'
      )
      await tap(0, pad)
      assert.equal(
        await nav.getAttribute('data-focused'),
        'true',
        route + ' repeated A stays in header'
      )
      if (route === 'library')
        assert.equal(
          await page
            .locator('[data-field=library-search]')
            .evaluate((e) => e === document.activeElement),
          false
        )
    }
    await tap(13, pad)
    assert.equal(await page.locator('.app-header [data-focused=true]').count(), 0)
    await tap(5, pad)
    await screen('systems')
    await page.locator('[data-system]').first().waitFor()
    await page.locator('[data-route=systems][data-focused=true]').waitFor()
    for (const [button, routes] of [
      [5, ['collections', 'library', 'home', 'systems']],
      [4, ['home', 'library', 'collections', 'systems']]
    ]) {
      for (const route of routes) {
        await tap(13, pad)
        assert.equal(await page.locator('.app-header [data-focused=true]').count(), 0)
        await tap(button, pad)
        await screen(route)
        if (route === 'systems') await page.locator('[data-system]').first().waitFor()
        if (route === 'collections') await page.locator('[data-collection]').first().waitFor()
        if (route === 'home') await page.locator('.continue-card').waitFor()
        await frames()
        await page.locator(`[data-route=${route}][data-focused=true]`).waitFor()
      }
    }
    // Repeated shoulder presses from the header follow the same rule.
    await tap(5, pad)
    await page.locator('[data-route=collections][data-focused=true]').waitFor()
    await tap(4, pad)
    await page.locator('[data-route=systems][data-focused=true]').waitFor()
    console.log(
      `PASS pad ${pad + 1}: both root shoulders always focus the header; Down deliberately enters content`
    )

    await tap(9, pad)
    await page.locator('[data-action=open-settings]').click()
    await screen('settings')
    for (const route of ['bios', 'downloads', 'emulators', 'settings']) {
      const nav = page.locator(`[data-utility-route=${route}]`)
      await nav.hover()
      await tap(0, pad)
      await screen(route)
      // Allow each async utility default to arrive before testing retained focus.
      await page.waitForTimeout(350)
      assert.equal(await nav.getAttribute('data-focused'), 'true')
      await tap(0, pad)
      assert.equal(await nav.getAttribute('data-focused'), 'true')
    }
    await tap(9, pad)
    await page.locator('.overlay--menu [data-focused=true]').waitFor()
    await tap(1, pad)
    await page.locator('[data-utility-route=settings][data-focused=true]').waitFor()
    await tap(13, pad)
    assert.equal(await page.locator('.app-header [data-focused=true]').count(), 0)
    await tap(7, pad)
    await page.locator('[data-tab=games][data-active=true]').waitFor()
    await tap(1, pad)
    await screen('systems')
    console.log(
      `PASS pad ${pad + 1}: utility activation stays in header; menu, Down, triggers and Back work`
    )
  }
  await page.locator('[data-route=downloads]').click()
  await page.locator('[data-utility-route=downloads][data-focused=true]').waitFor()
  await tap(1)
  await screen('systems')
  console.log('PASS Downloads shortcut retains focus in the replacement header')

  await page.locator('[data-route=collections]').click()
  await page.locator('[data-collection]').first().waitFor()
  await page
    .locator('[data-control=collection-kind] [data-option=mine][data-active=true]')
    .waitFor()
  const own = await page.evaluate(() => rommix.library.collections())
  const ids = await page
    .locator('[data-collection]')
    .evaluateAll((es) => es.map((e) => e.dataset.collection))
  assert.ok(ids.every((id) => own.some((c) => String(c.id) === id)))
  await page.locator('[data-control=collection-kind] [data-option=virtual]').click()
  const card = page.locator('[data-collection]').first()
  const id = await card.getAttribute('data-collection')
  await card.click()
  await screen('collection')
  await tap(1)
  await page.locator(`[data-collection="${id}"][data-focused=true]`).waitFor()
  await page
    .locator('[data-control=collection-kind] [data-option=virtual][data-active=true]')
    .waitFor()
  await page.locator('[data-route=home]').click()
  await page.locator('[data-route=collections]').click()
  await page
    .locator('[data-control=collection-kind] [data-option=mine][data-active=true]')
    .waitFor()
  console.log(
    'PASS fresh Collections shows Mine; explicit virtual choice and Back restoration remain'
  )
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
