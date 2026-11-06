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
const header = () =>
  page.locator('.app-header').evaluate((e) => {
    const r = e.getBoundingClientRect(),
      s = getComputedStyle(e)
    return { height: r.height, top: r.top, bg: s.backgroundColor, border: s.borderBottomColor }
  })
const sameHeader = async (baseline) => {
  await frames()
  assert.equal(await page.locator('.app-header').count(), 1)
  assert.deepEqual(await header(), baseline)
  const buttons = await page.locator('.app-header .topbar__nav .nav-item').evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect()
      return { top: r.top, height: r.height }
    })
  )
  if (buttons.length)
    assert.ok(buttons.every((b) => b.top === buttons[0].top && b.height === buttons[0].height))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
}
const menuGeometry = () =>
  page
    .locator('.topbar__utilities [data-route=settings], [data-action=utility-menu]')
    .evaluate((e) => {
      const r = e.getBoundingClientRect(),
        icon = e.querySelector('svg').getBoundingClientRect()
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        iconWidth: icon.width,
        iconHeight: icon.height
      }
    })
const capture = async (name) => {
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` })
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
    let bridge
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const settings = value.system.settings
        value.system.settings = async () => ({
          ...(await settings()),
          theme: new URLSearchParams(location.search).get('fixtureTheme') ?? 'midnight'
        })
        const platforms = value.library.platforms
        value.library.platforms = () => {
          if (window.failPlatforms)
            return Promise.reject(Error('Fixture platform metadata unavailable'))
          if (window.holdPlatforms)
            return new Promise((resolve) => {
              window.releasePlatforms = () => platforms().then(resolve)
            })
          return platforms()
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  assert.match(await page.title(), /demo/i)
  await page.locator('.continue-card').waitFor()
  for (const theme of ['midnight', 'daylight', 'c64']) {
    await page.goto(`${process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/'}?fixtureTheme=${theme}`)
    await page.locator('.continue-card').waitFor()
    const baseline = await header()
    const rootMenu = await menuGeometry()
    assert.equal(baseline.height, 58)
    for (const root of ['systems', 'collections', 'library', 'home']) {
      await tap(5)
      await screen(root)
      await sameHeader(baseline)
    }
    await page.locator('[data-route=systems]').click()
    await page.locator('[data-system]').first().click()
    await page.locator('.library-grid .card').first().waitFor()
    await sameHeader(baseline)
    await page.locator('[data-control=layout] [data-option=list]').click()
    await sameHeader(baseline)
    await page.locator('[data-control=layout] [data-option=grid]').click()
    await tap(1)
    await screen('systems')
    await page.locator('[data-route=home]').click()
    for (const utility of ['settings', 'bios', 'emulators', 'downloads']) {
      await tap(9)
      await page.locator(`[data-action=open-${utility}]`).click()
      await screen(utility)
      await sameHeader(baseline)
      assert.deepEqual(await menuGeometry(), rootMenu)
      // Focus must remain visible without lifting any section out of the strip.
      for (const pad of [0, 1]) {
        await tap(5, pad)
        await page.mouse.move(0, 0)
        await page.locator('[data-utility-route=settings]').hover()
        await page.locator('[data-utility-route=settings][data-focused=true]').waitFor()
        await sameHeader(baseline)
        assert.deepEqual(await menuGeometry(), rootMenu)
      }
      await tap(1)
      await screen('home')
    }
  }
  console.log(
    'PASS root, utility and platform headers keep their frame, menu geometry and focused baseline'
  )

  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.continue-card').waitFor()
  const baseline = await header()
  for (const state of ['holdPlatforms', 'failPlatforms']) {
    await page.locator('[data-route=systems]').click()
    await page.locator('[data-system]').first().waitFor()
    await page.evaluate((key) => {
      window[key] = true
    }, state)
    await page.locator('[data-system]').first().click()
    await page.locator('[data-platform-pending=true]').waitFor()
    await sameHeader(baseline)
    if (state === 'holdPlatforms') {
      await page.waitForFunction(() => typeof window.releasePlatforms === 'function')
      await page.evaluate(() => {
        window.holdPlatforms = false
        window.releasePlatforms()
      })
      await page.locator('[data-platform-slot=current]').waitFor()
      await sameHeader(baseline)
    }
    await page.evaluate((key) => {
      window[key] = false
    }, state)
    await tap(1)
    await screen('systems')
  }
  console.log('PASS delayed or failed platform metadata keeps the header frame and working Back')

  await page.locator('[data-system]').first().click()
  await page.locator('.library-grid .card[data-focused=true]').waitFor()
  for (let pad = 0; pad < 2; pad++) {
    for (const button of [5, 5, 4, 4]) {
      await tap(button, pad)
      await sameHeader(baseline)
      const slots = await page.locator('[data-platform-slot]').evaluateAll((elements) =>
        elements.map((e) => {
          const icon = e.querySelector('.platform-carousel__icon').getBoundingClientRect(),
            text = e.querySelector('.platform-carousel__text').getBoundingClientRect(),
            name = e.querySelector('.platform-carousel__name').getBoundingClientRect(),
            r = e.getBoundingClientRect()
          return {
            iconWidth: icon.width,
            iconHeight: icon.height,
            iconBeforeText: icon.right <= text.left,
            fit:
              icon.left >= r.left &&
              icon.right <= r.right &&
              icon.top >= r.top &&
              icon.bottom <= r.bottom &&
              name.right <= r.right,
            art: !!e.querySelector('.system-icon,.platform-badge')
          }
        })
      )
      assert.equal(slots.length, 3)
      assert.ok(
        slots.every(
          (s) => s.iconWidth === 28 && s.iconHeight === 28 && s.fit && s.art && s.iconBeforeText
        )
      )
    }
  }
  await capture('header-carousel')
  console.log('PASS all three carousel slots show bounded platform artwork on both pad paths')

  for (const width of [390, 950, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await sameHeader(baseline)
    await tap(1)
    await screen('systems')
    await sameHeader(baseline)
    await tap(9)
    await page.locator('[data-action=open-settings]').click()
    await screen('settings')
    await sameHeader(baseline)
    await tap(1)
    await screen('systems')
    await page.locator('[data-system]').first().click()
    await page.locator('[data-platform-slot=current]').waitFor()
  }
  console.log('PASS shared header retains its frame across narrow and wide layouts')

  await page.setViewportSize({ width: 1600, height: 900 })
  await tap(1)
  await screen('systems')
  await page.locator('[data-route=home]').click()
  for (const [pad, kind] of ['pick', 'anniversary'].entries()) {
    await page.locator(`[data-widget=${kind}][aria-busy=false] [data-action=open-${kind}]`).click()
    await screen('game')
    await tap(1, pad)
    await page.locator(`[data-action=open-${kind}][data-focused=true]`).waitFor()
    const geometry = await page.locator(`[data-action=open-${kind}]`).evaluate((e) => {
      const b = e.getBoundingClientRect(),
        c = e.querySelector('.cover').getBoundingClientRect(),
        style = getComputedStyle(e)
      return {
        width: c.width,
        insets: [c.left - b.left, c.top - b.top, b.right - c.right, b.bottom - c.bottom],
        ring: style.boxShadow
      }
    })
    assert.equal(geometry.width, 80)
    assert.ok(
      geometry.insets.every((gap) => gap >= 4),
      JSON.stringify(geometry)
    )
    assert.notEqual(geometry.ring, 'none')
    const row = await page.locator('.home-featured').evaluate((e) => {
      const a = e.querySelector('.continue-card').getBoundingClientRect(),
        b = e.querySelector('.home-widgets').getBoundingClientRect()
      return { main: a.height, stack: b.height, aligned: Math.abs(a.bottom - b.bottom) < 1 }
    })
    assert.deepEqual(row, { main: 344, stack: 344, aligned: true })
    await capture(`header-${kind}-focus`)
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS focused discovery covers clear the ring without shrinking art or changing Home height'
  )
} finally {
  await browser.close()
}
