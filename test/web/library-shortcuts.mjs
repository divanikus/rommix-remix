// Public synthetic metadata only; exercise the real input polling and layout.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'chrome',
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const pad = (button, pressed) =>
  page.evaluate(
    ({ button: index, pressed: down }) => {
      window.testPad.buttons[index] = { pressed: down, value: Number(down) }
    },
    { button, pressed }
  )
const tap = async (button) => {
  await pad(button, true)
  await page.waitForTimeout(70)
  await pad(button, false)
  await page.waitForTimeout(130)
}
const focus = () => page.locator('[data-focus-collection] [data-focused="true"]')
const id = async () => Number(await focus().getAttribute('data-rom'))
const waitId = (romId) =>
  page.locator(`[data-focus-collection] [data-rom="${romId}"][data-focused="true"]`).waitFor()
const hover = async (romId) => {
  await page.locator(`[data-focus-collection] [data-rom="${romId}"]`).hover()
  await page.mouse.move(0, 0)
}
try {
  await page.addInitScript(() => {
    window.testPad = {
      id: 'Shortcut fixture',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.topbar').waitFor()
  assert.match(await page.title(), /demo/i)
  await page.evaluate(async () => {
    const seed = (await rommix.library.roms({ limit: 1 })).items[0]
    const platforms = (await rommix.library.platforms())
      .filter((p) => p.rom_count > 0)
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
    window.shortcutPlatforms = platforms.map((p) => p.id)
    const data = platforms.map((p, n) =>
      Array.from({ length: 600 }, (_, i) => ({
        ...seed,
        id: (n + 1) * 10000 + i,
        platform_id: p.id,
        name: `${String.fromCharCode(65 + Math.max(0, Math.floor(i / 60) - 2))} Fixture ${String(i).padStart(4, '0')}`,
        sibling_roms: []
      }))
    )
    window.shortcutQueries = []
    const rom = rommix.library.rom
    rommix.library.rom = async (romId) => data.flat().find((r) => r.id === romId) ?? rom(romId)
    rommix.library.roms = async (query) => {
      window.shortcutQueries.push(query)
      const items =
        data[
          Math.max(
            0,
            platforms.findIndex((p) => p.id === query.platform_ids?.[0])
          )
        ]
      const ordered = query.order_dir === 'desc' ? items.toReversed() : items
      const offset = query.offset ?? 0,
        limit = query.limit ?? 60
      await new Promise((r) => setTimeout(r, 450))
      return { items: ordered.slice(offset, offset + limit), offset, limit, total: items.length }
    }
  })
  await page.locator('[data-route="systems"]').click()
  await page.locator('[data-system]').first().click()
  await waitId(10000)
  assert.equal(await page.locator('[data-action="all-systems"]').count(), 0)
  await tap(7)
  await page.locator('.library-jump-status').waitFor()
  await waitId(10180)
  assert.equal(await page.locator('.library-letter').innerText(), 'B')
  await tap(6)
  await waitId(10000)
  console.log(
    'PASS grid letter jump spans multiple slow metadata pages and returns to the previous group'
  )

  await page.locator('[data-control="layout"] [data-option="list"]').click()
  await hover(10000)
  await pad(7, true)
  await page.waitForTimeout(1800)
  await pad(7, false)
  await page.locator('.library-jump-status').waitFor({ state: 'detached' })
  assert.ok((await id()) >= 10240, 'Holding RT must advance through letters in List')
  const held = await id()
  await page.waitForTimeout(700)
  assert.equal(await id(), held, 'Release must not leave queued jumps')
  await tap(13)
  await tap(6)
  assert.equal(
    ((await id()) - 10000) % 60,
    0,
    'Previous returns to the start of the current letter'
  )
  console.log(
    'PASS held triggers accelerate List without queued presses; LT returns to a group start'
  )

  for (const layout of ['list', 'grid']) {
    await page.locator(`[data-control="layout"] [data-option="${layout}"]`).click()
    await hover(10240)
    await tap(8)
    await page.locator('.platform-carousel [data-focused="true"]').waitFor()
    await tap(8)
    await waitId(10240)
    const box = await focus().boundingBox()
    assert.ok(box.y >= 0 && box.y + box.height <= 1035)
  }
  console.log('PASS Select reaches the header and returns to the exact visible game in both views')

  await page.locator('[data-control="layout"] [data-option="list"]').click()
  await hover(10240)
  await page.evaluate(() => {
    window.carouselNode = document.querySelector('.platform-carousel')
    window.carouselAnchor = document.querySelector('.platform-carousel__current')
    window.platformSamples = []
    window.homeFlashed = false
    window.watchingPlatform = true
    window.platformObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.target.dataset.route === 'home' &&
          (record.oldValue === 'true' || record.target.dataset.focused === 'true')
        )
          window.homeFlashed = true
      }
    })
    window.platformObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-focused'],
      attributeOldValue: true
    })
    const sample = () => {
      if (!window.watchingPlatform) return
      window.platformSamples.push({
        mounted: window.carouselNode.isConnected && window.carouselAnchor.isConnected,
        games: document.querySelectorAll('.library-row').length,
        focused: document.querySelector('[data-focused="true"]')?.className
      })
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await tap(5)
  await waitId(20000)
  const transition = await page.evaluate(() => {
    window.watchingPlatform = false
    window.platformObserver.disconnect()
    return { samples: window.platformSamples, homeFlashed: window.homeFlashed }
  })
  assert.equal(
    transition.homeFlashed,
    false,
    'Home must never borrow focus during a platform change'
  )
  assert.ok(
    transition.samples.length > 0 && transition.samples.every((s) => s.mounted && s.games > 0),
    'Warm switching retains the carousel and does not paint a blank game list'
  )
  const slots = await page
    .locator('.platform-carousel [data-platform-slot]')
    .evaluateAll((elements) =>
      elements.map((e) => ({
        slot: e.dataset.platformSlot,
        platform: Number(e.dataset.platform),
        label: e.textContent
      }))
    )
  const systemIds = await page.evaluate(() => window.shortcutPlatforms)
  assert.deepEqual(
    slots.map((s) => s.platform),
    [systemIds[0], systemIds[1], systemIds[2 % systemIds.length]]
  )
  assert.ok(slots.every((s) => s.label.trim().length > 2))
  console.log(
    'PASS persistent previous/current/next carousel; warm switching paints games without Home focus or a blank list'
  )
  assert.equal(await page.locator('.library-screen[data-layout="list"]').count(), 1)
  const title = await page.locator('.platform-carousel__current').innerText()
  await tap(0)
  await page.locator('.game-screen [data-focused="true"]').waitFor()
  const active = await page
    .locator('.game-screen .tabs [data-active="true"]')
    .getAttribute('data-tab')
  await tap(5)
  assert.equal(await page.locator('.platform-carousel').count(), 0)
  assert.notEqual(
    await page.locator('.game-screen .tabs [data-active="true"]').getAttribute('data-tab'),
    active
  )
  await tap(1)
  await waitId(20000)
  assert.equal(await page.locator('.platform-carousel__current').innerText(), title)
  await tap(4)
  await waitId(10000)
  await tap(4)
  const platforms = await page.evaluate(() => window.shortcutPlatforms)
  await waitId(platforms.length * 10000)
  await tap(1)
  await page.locator(`[data-system="${platforms.at(-1)}"][data-focused="true"]`).waitFor()
  console.log(
    'PASS shoulders cycle and wrap platforms, preserve List, retain detail tabs and Back restores the current system'
  )

  // A fresh system starts with fewer than 180 A titles; cancel its pending jump.
  await page.locator('[data-system]').first().click()
  await waitId(10000)
  await tap(7)
  await page.locator('.library-jump-status').waitFor()
  await tap(8)
  await page.waitForTimeout(1400)
  assert.equal(await page.locator('.platform-carousel [data-focused="true"]').count(), 1)
  assert.equal(await page.locator('.library-jump-status').count(), 0)
  await tap(8)
  await waitId(10000)
  await page.keyboard.press('PageDown')
  await waitId(10180)
  await page.keyboard.press('Home')
  await page.locator('.platform-carousel [data-focused="true"]').waitFor()
  await page.keyboard.press('Home')
  await waitId(10180)
  console.log(
    'PASS late fetch cannot steal header focus; keyboard shortcuts share controller behavior'
  )
  // Change query and switch before its neighbor metadata can arrive.
  await page.locator('input[data-field="library-search"]').fill('cold query')
  await tap(5)
  await page.locator('.platform-carousel__current[data-focused="true"]').waitFor()
  await tap(8)
  await page.waitForTimeout(1000)
  assert.equal(await page.locator('.platform-carousel [data-focused="true"]').count(), 1)
  assert.equal(await page.locator('.library-row').first().getAttribute('data-rom'), '20000')
  assert.equal(await page.locator('input[data-field="library-search"]').inputValue(), 'cold query')
  console.log(
    'PASS cold platform entry retains search and respects header input while metadata is loading'
  )
  await tap(8)
  await waitId(20000)
  for (let turn = 0; turn < 12; turn++) {
    // Recreate a details-tab visit before each forward/back platform change.
    await tap(0)
    await page.locator('.game-screen [data-focused="true"]').waitFor()
    await tap(5)
    await tap(1)
    // A standalone card remounts the list and its intentionally slow fixture query.
    await waitId(turn % 2 === 0 ? 20000 : 10000)
    await tap(turn % 2 === 0 ? 4 : 5)
    await waitId(turn % 2 === 0 ? 10000 : 20000)
    assert.equal(await page.locator('.platform-carousel [data-focused="true"]').count(), 0)
  }
  console.log('PASS repeated detail/tab/back/platform transitions preserve arrival focus')
  assert.deepEqual(errors, [])
} catch (error) {
  console.error(
    await page.evaluate(() => ({
      screen: document.querySelector('.app')?.dataset.screen,
      platform: document.querySelector('.platform-carousel__current')?.dataset.platform,
      focus: [...document.querySelectorAll('[data-focused="true"]')].map((e) => ({
        name: e.className,
        rom: e.dataset.rom,
        slot: e.dataset.platformSlot
      })),
      games: [...document.querySelectorAll('.library-row')].slice(0, 3).map((e) => e.dataset.rom),
      queries: window.shortcutQueries?.slice(-4)
    }))
  )
  throw error
} finally {
  await browser.close()
}
