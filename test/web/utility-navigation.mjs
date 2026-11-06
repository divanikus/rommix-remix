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
const capture = async (name) => {
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` })
}
const screen = (name) => page.locator(`.app[data-screen="${name}"]`).waitFor()
const menu = async (index = 0) => {
  await tap(9, index)
  await page.locator('.overlay--menu').waitFor()
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
        const bios = value.bios.list
        value.bios.list = () => {
          if (window.failBios) return Promise.reject(Error('Fixture firmware unavailable'))
          if (window.holdBios) return new Promise(() => {})
          return bios()
        }
        window.quitCalls = 0
        value.system.quit = () => {
          window.quitCalls++
          return Promise.resolve()
        }
        window.powerQueries = 0
        value.system.powerActions = async () => {
          window.powerQueries++
          return ['suspend', 'reboot', 'poweroff']
        }
        value.updates.onStatus = (callback) => {
          window.pushUpdate = callback
          return () => {}
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  assert.match(await page.title(), /demo/i)
  await page.locator('.continue-card').waitFor()
  const rows = page.locator('.overlay--menu .tools-menu .btn')
  for (let pad = 0; pad < 2; pad++) {
    await menu(pad)
    const panel = await page.locator('.overlay--menu .overlay__panel').boundingBox()
    assert.ok(panel.width <= 340 && panel.height < 550)
    assert.equal(await rows.count(), 5)
    const boxes = await rows.evaluateAll((elements) =>
      elements.map((e) => e.getBoundingClientRect().x)
    )
    assert.ok(boxes.every((x) => x === boxes[0]))
    await tap(13, pad)
    assert.equal(
      await page.locator('.tools-menu [data-focused=true]').getAttribute('data-action'),
      'open-emulators'
    )
    await tap(1, pad)
    assert.equal(await page.locator('.overlay--menu').count(), 0)
    await screen('home')
  }
  await menu()
  await capture('utility-menu')
  await tap(9)
  assert.equal(await page.locator('.overlay--menu').count(), 0)
  console.log('PASS compact aligned menu traps both pad inputs and closes with B/Start')

  for (let pad = 0; pad < 2; pad++) {
    for (const root of ['home', 'systems', 'collections', 'library']) {
      await screen(root)
      const trigger = page.locator('.topbar__utilities [data-route=settings]')
      assert.equal(await trigger.textContent(), '')
      assert.equal(await trigger.getAttribute('aria-label'), 'Menu')
      for (const inContent of [false, true]) {
        if (inContent) await tap(13, pad)
        await tap(1, pad)
        await page.locator('.overlay--menu').waitFor()
        assert.equal(await rows.count(), 5)
        assert.equal(await page.locator('[data-action=close-tools]').count(), 0)
        assert.equal(await page.locator('.overlay:not(.overlay--menu)').count(), 0)
        await tap(9, pad)
        await screen(root)
      }
      assert.match(await page.locator('.hints').innerText(), /Start\s*Menu/)
      assert.match(await page.locator('.hints').innerText(), /B\s*Menu/)
      await tap(5, pad)
    }
  }
  console.log(
    'PASS B opens the same menu on all four roots; icon-only trigger and footer hints agree'
  )

  for (let pad = 0; pad < 2; pad++) {
    await menu(pad)
    await tap(0, pad)
    await screen('settings')
    await page.locator('.tab[data-active=true][data-tab=general]').waitFor()
    assert.equal(await page.locator('.library-topbar').count(), 0)
    assert.equal(await page.locator('.tabs__bumper').count(), 2)
    await tap(7, pad)
    await page.locator('.tab[data-active=true][data-tab=games]').waitFor()
    await tap(6, pad)
    await page.locator('.tab[data-active=true][data-tab=general]').waitFor()
    await page.locator('.content').evaluate((e) => {
      e.scrollTop = e.scrollHeight
    })
    const back = await page.locator('[data-action=utility-back]').boundingBox()
    assert.ok(back.y >= 0 && back.y + back.height < 80)
    await capture('utility-settings')
    await tap(1, pad)
    await screen('home')
    assert.equal(await page.locator('.overlay').count(), 0)
  }
  console.log('PASS Settings shows local triggers; B exits from deep scroll on either pad')

  await menu()
  await page.locator('[data-action=open-settings]').click()
  await screen('settings')
  assert.equal(await page.getByRole('button', { name: 'Quit RomMix', exact: true }).count(), 0)
  assert.equal(await page.locator('[data-action=utility-menu]').textContent(), '')
  await page.locator('[data-tab=system]').click()
  const status = await page.evaluate(() => window.rommix.updates.status())
  for (const restartBlocked of [
    'Steam owns the next launch. Quit from the menu, then press Play.',
    null
  ]) {
    await page.evaluate((next) => window.pushUpdate(next), {
      ...status,
      state: 'ready',
      latest: '9.9.9',
      blockedReason: null,
      restartBlocked
    })
    await frames()
    assert.equal(await page.getByRole('button', { name: 'Quit RomMix', exact: true }).count(), 0)
    assert.equal(
      await page.getByRole('button', { name: 'Restart now', exact: true }).count(),
      restartBlocked ? 0 : 1
    )
  }
  await page.evaluate((next) => window.pushUpdate(next), status)
  await tap(1)
  await screen('home')
  console.log(
    'PASS Settings has no duplicate Quit, including Steam-ready updates; standalone restart remains'
  )

  for (let pad = 0; pad < 2; pad++) {
    await menu(pad)
    for (const cancel of [1, 9, 0]) {
      await page.locator('[data-action=menu-quit]').click()
      await page.locator('[data-action=cancel-quit][data-focused=true]').waitFor()
      assert.equal(await rows.count(), 2)
      assert.equal(await page.locator('.overlay:not(.overlay--menu)').count(), 0)
      assert.ok((await page.locator('.overlay__panel').boundingBox()).width <= 340)
      await capture('utility-quit')
      await tap(cancel, pad)
      await page.locator('[data-action=open-settings][data-focused=true]').waitFor()
      assert.equal(await rows.count(), 5)
    }
    await tap(1, pad)
  }
  assert.equal(await page.evaluate(() => window.quitCalls), 0)
  await menu()
  await page.locator('[data-action=menu-quit]').click()
  await page.locator('[data-action=cancel-quit][data-focused=true]').waitFor()
  await tap(13)
  await tap(0)
  assert.equal(await page.evaluate(() => window.quitCalls), 1)
  assert.equal(await page.evaluate(() => window.powerQueries), 0)
  await tap(1)
  await tap(1)
  console.log(
    'PASS compact Quit defaults to Stay, cancels with B/Start/A, and only confirms app exit'
  )

  await menu()
  await page.locator('[data-action=open-settings]').click()
  await screen('settings')
  await menu()
  await page.locator('[data-action=open-bios]').click()
  await screen('bios')
  await page.locator('[data-action=recheck-bios]').waitFor()
  assert.equal(await page.locator('.library-topbar').count(), 0)
  assert.equal(await page.locator('.utility-sections .nav-bumper').count(), 2)
  await capture('utility-bios')
  await tap(1)
  await screen('home')
  console.log('PASS BIOS has a visible exit and utility peers return directly to their origin')

  for (const state of ['failBios', 'holdBios']) {
    await page.evaluate((key) => {
      window.failBios = false
      window.holdBios = false
      window[key] = true
    }, state)
    await menu()
    await page.locator('[data-action=open-bios]').click()
    await screen('bios')
    await page.locator(state === 'failBios' ? '.notice--error' : '.spinner').waitFor()
    await page.locator('[data-action=utility-back]').click()
    await screen('home')
  }
  console.log('PASS BIOS loading/error states keep a working visible Back action')

  await page.locator('.continue-card__cover').waitFor()
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-widget=pick][aria-busy=false] [data-action=open-pick]').waitFor()
    await page
      .locator('[data-widget=anniversary][aria-busy=false] [data-action=open-anniversary]')
      .waitFor()
    const sizes = await page.evaluate(() => {
      const featured = document.querySelector('.continue-card').getBoundingClientRect()
      const stack = document.querySelector('.home-featured .home-widgets').getBoundingClientRect()
      const widgets = [...document.querySelectorAll('.home-featured .home-widget')]
      return {
        top: Math.abs(featured.top - stack.top),
        bottom: Math.abs(featured.bottom - stack.bottom),
        fit: widgets.every((e) =>
          [...e.children].every(
            (c) => c.getBoundingClientRect().bottom <= e.getBoundingClientRect().bottom + 1
          )
        ),
        cover: document.querySelector('.continue-card__cover').getBoundingClientRect().width
      }
    })
    assert.ok(sizes.top < 1 && sizes.bottom < 1 && sizes.fit && sizes.cover >= 231)
    await page.locator('[data-action=pick-again]').click()
    await frames()
  }
  await page.locator('[data-widget=pick][aria-busy=false] [data-action=open-pick]').waitFor()
  await capture('utility-home')
  console.log('PASS featured card and discovery stack align without shrinking their artwork')

  for (const width of [390, 950, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await menu()
    const panel = await page.locator('.overlay--menu .overlay__panel').boundingBox()
    assert.ok(panel.x >= 0 && panel.x + panel.width <= width)
    await page.locator('[data-action=open-settings]').click()
    await screen('settings')
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
      JSON.stringify(
        await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          outside: [...document.querySelectorAll('.utility-topbar,.content,.hints,.app')].map(
            (e) => ({
              class: e.className,
              x: e.getBoundingClientRect().x,
              width: e.getBoundingClientRect().width
            })
          )
        }))
      )
    )
    await tap(1)
    await screen('home')
  }
  assert.deepEqual(errors, [])
  console.log('PASS menu and utility header fit narrow and wide layouts')
} finally {
  await browser.close()
}
