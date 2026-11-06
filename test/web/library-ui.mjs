// Run against `vite --config vite.web.config.ts` only. No real server or filesystem operations.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'chrome',
  headless: true
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const checks = []
const check = (name) => {
  checks.push(name)
  console.log('PASS', name)
}
const press = async (button) => {
  await page.evaluate((b) => {
    window.testPad.buttons[b] = { pressed: true, touched: true, value: 1 }
  }, button)
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
  await page.evaluate((b) => {
    window.testPad.buttons[b] = { pressed: false, touched: false, value: 0 }
  }, button)
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
  )
}
try {
  await page.addInitScript(() => {
    window.testPad = {
      id: 'UI regression pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      timestamp: 0
    }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await page.locator('.topbar').waitFor()
  // Refuse live Electron/server bridges: only the public, explicitly labelled stub is safe.
  assert.match(await page.title(), /demo/i)
  const fixture = await page.evaluate(async () => {
    const grouped = (await rommix.library.roms({ limit: 1000, group_by_meta_id: true })).items
    const local = await rommix.library.installed()
    const game = grouped.find(
      (r) =>
        r.sibling_roms.length &&
        [r.id, ...r.sibling_roms.map((s) => s.id)].some((id) => local.some((l) => l.romId === id))
    )
    window.testCalls = []
    for (const action of ['start', 'uninstall', 'pause', 'cancel']) {
      rommix.downloads[action] = async (id) => {
        window.testCalls.push({ action, id })
      }
    }
    return { game, localIds: local.map((g) => g.romId) }
  })
  assert.ok(fixture.game, 'Demo needs an installed group with an alternate version')
  const game = fixture.game
  if (await page.locator('.platform-carousel').count()) await press(1)
  await page.locator('[data-route="systems"]').click()
  await page.locator('[data-system]').first().waitFor()
  assert.equal(await page.locator('.topbar__host').count(), 0)
  const system = page.locator(`[data-system="${game.platform_id}"]`)
  await system.click()
  await page.locator(`.library-grid [data-rom="${game.id}"]`).waitFor()
  assert.equal(await page.locator('.library-detail').count(), 0)
  check('system opens its full-width grouped grid without persistent server chrome')
  const coverWidth = async () =>
    (await page.locator('.library-grid .cover').first().boundingBox()).width
  await page.locator('[data-control="cover-size"] [data-option="small"]').click()
  const small = await coverWidth()
  await page.locator('[data-control="cover-size"] [data-option="large"]').click()
  assert.ok((await coverWidth()) > small)
  await page.locator(`.library-grid [data-rom="${game.id}"]`).hover()
  await page.locator(`.library-grid [data-rom="${game.id}"][data-focused="true"]`).waitFor()
  await page.locator('[data-control="layout"] [data-option="list"]').click()
  await page.locator('.library-row').first().waitFor()
  const rows = await page.locator('.library-rows').boundingBox()
  const layout = await page.locator('.library-layout').boundingBox()
  assert.ok(rows.width >= layout.width - 2)
  assert.equal(await page.locator('.library-detail').count(), 0)
  assert.ok(rows.y + rows.height <= 740, 'Table scrolling must stay above the footer')
  assert.equal(
    await page.locator('.library-row[data-selected="true"]').getAttribute('data-rom'),
    String(game.id)
  )
  check('cover size changes; table preserves selection and fills the available width')
  await page.locator('.library-row[data-selected="true"]').hover()
  await press(0)
  await page.waitForFunction(() => !!document.querySelector('.game-screen [data-focused="true"]'))
  await press(1)
  await page.waitForFunction(() => !!document.querySelector('.library-row[data-focused="true"]'))
  // Shoulders now cycle systems from rows; the detail pane owns its tabs only
  // while focus is inside it.
  await press(0)
  await page.waitForFunction(() => !!document.querySelector('.game-screen [data-focused="true"]'))
  const beforeTab = await page
    .locator('.game-screen .tab[data-active="true"]')
    .getAttribute('data-tab')
  await press(5)
  assert.notEqual(
    await page.locator('.game-screen .tab[data-active="true"]').getAttribute('data-tab'),
    beforeTab
  )
  await press(4)
  assert.equal(
    await page.locator('.game-screen .tab[data-active="true"]').getAttribute('data-tab'),
    beforeTab
  )
  check('gamepad opens/closes a standalone card and shoulders advance exactly one tab')

  await page.locator('.game-screen [data-tab="versions"]').click()
  const target = game.sibling_roms.find((s) => !fixture.localIds.includes(s.id))
  assert.ok(target, 'An alternate version must be remote-only')
  await page.locator(`.game-screen .asset-list [data-rom="${target.id}"]`).click()
  await page.waitForFunction(
    (name) =>
      document.querySelector('.game-screen .game-version strong')?.textContent?.includes(name),
    target.fs_name_no_ext
  )
  assert.equal(
    await page.locator('.game-screen [data-focused="true"]').count(),
    1,
    'Version choice must keep focus in details'
  )
  await page.locator('.game-screen [data-action="download"]').click()
  if (await page.locator('[data-action="download-anyway"]').count())
    await page.locator('[data-action="download-anyway"]').click()
  await page.waitForFunction(() => window.testCalls.length > 0)
  assert.deepEqual(await page.evaluate(() => window.testCalls), [
    { action: 'start', id: target.id }
  ])
  check('the card opened from a table targets the selected version for download')
  // Standalone version comparison keeps RomMix's existing history: back to
  // the original version, then the row, rather than inventing a second pane.
  await press(1)
  await page.locator('.game-screen .game-version').waitFor()
  await press(1)
  await page.locator(`.library-row[data-rom="${game.id}"][data-focused="true"]`).waitFor()
  await page.locator('[data-control="layout"] [data-option="grid"]').click()
  await page.locator(`.library-grid [data-rom="${game.id}"]`).click()
  await page.locator('.game-screen .game-version').waitFor()
  await press(1)
  await page.locator(`.library-grid [data-rom="${game.id}"][data-focused="true"]`).waitFor()
  check('table and grid share exact grouped selection on card/Back')
  await page.locator('[data-control="layout"] [data-option="list"]').click()
  await page.locator(`.library-row[data-rom="${game.id}"]`).click()
  await page.locator('.game-screen .game-version').waitFor()
  await page.locator('.game-screen [data-tab="versions"]').click()
  const installedId = [game.id, ...game.sibling_roms.map((s) => s.id)].find((id) =>
    fixture.localIds.includes(id)
  )
  await page.locator(`.game-screen .asset-list [data-rom="${installedId}"]`).click()
  await page.locator('.game-screen [data-action="uninstall"]').click()
  await page.locator('[data-action="keep-game"][data-focused="true"]').waitFor()
  assert.equal((await page.evaluate(() => window.testCalls)).length, 1)
  await page.locator('[data-action="keep-game"]').click()
  assert.equal((await page.evaluate(() => window.testCalls)).length, 1)
  await page.locator('.game-screen [data-action="uninstall"]').click()
  await page.locator('[data-action="uninstall-confirm"]').click()
  await page.waitForFunction(() => window.testCalls.length === 2)
  assert.deepEqual((await page.evaluate(() => window.testCalls))[1], {
    action: 'uninstall',
    id: installedId
  })
  check('local removal still defaults to Keep and only confirmed removal calls the exact ROM ID')

  await page.reload()
  if (await page.locator('.platform-carousel').count()) await press(1)
  await page.locator('[data-route="systems"]').click()
  await page.locator(`[data-system="${game.platform_id}"]`).click()
  await page.locator('.library-rows').waitFor()
  await page.locator('[data-control="layout"] [data-option="grid"]').click()
  await page
    .locator('[data-control="cover-size"] [data-option="large"][data-active="true"]')
    .waitFor()
  check('list preference and cover size survive reload')
  for (const width of [1920, 1024, 700, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(120)
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow at ${width}`
    )
    await page.locator('[data-control="layout"] [data-option="list"]').click()
    await page.locator('.library-row').first().waitFor()
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `list overflow at ${width}`
    )
    await page.locator('[data-control="layout"] [data-option="grid"]').click()
  }
  check('grid/list render without horizontal page overflow from 390 to 1920 px')
  await page.setViewportSize({ width: 1280, height: 800 })
  const search = page.locator('[data-field="library-search"]')
  await search.fill('No matching demo game 123456')
  await page.locator('.library-grid .empty').waitFor()
  await page.locator('[data-control="layout"] [data-option="list"]').click()
  assert.equal(await page.locator('.library-detail').count(), 0)
  assert.equal(await search.inputValue(), 'No matching demo game 123456')
  await search.fill('')
  await page.locator('.library-row').first().waitFor()
  check('empty search keeps its filter across views and removes stale details')

  // A deliberately large in-memory library exercises paging inside the new
  // independently scrolling list. No inventory or media is written.
  await page.evaluate(async () => {
    const seed = (await rommix.library.roms({ limit: 1 })).items[0]
    const items = Array.from({ length: 145 }, (_, i) => ({
      ...seed,
      id: 10000 + i,
      name: `Paging fixture ${i}`,
      sibling_roms: []
    }))
    window.testQueries = []
    const rom = rommix.library.rom
    rommix.library.rom = async (id) => items.find((item) => item.id === id) ?? rom(id)
    rommix.library.roms = async (query) => {
      window.testQueries.push(query)
      const offset = query.offset ?? 0
      const limit = query.limit ?? 60
      return { items: items.slice(offset, offset + limit), offset, limit, total: items.length }
    }
  })
  if (await page.locator('.platform-carousel').count()) await press(1)
  await page.locator('[data-route="systems"]').click()
  await page.locator(`[data-system="${game.platform_id}"]`).click()
  await page.waitForFunction(() => document.querySelectorAll('.library-row').length >= 60)
  for (const count of [120, 145]) {
    await page.locator('.library-rows').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.waitForFunction((n) => document.querySelectorAll('.library-row').length >= n, count)
  }
  const last = page.locator('.library-row[data-rom="10144"]')
  await last.hover()
  await page.locator('.library-screen[data-selected-rom="10144"]').waitFor()
  await page.locator('[data-control="layout"] [data-option="grid"]').click()
  await page.locator('.library-grid [data-rom="10144"]').click()
  await page.locator('.game-screen .game-hero').waitFor()
  await press(1)
  await page.locator('.library-grid [data-rom="10144"][data-focused="true"]').waitFor()
  assert.ok(
    await page.evaluate(() => window.testQueries.some((q) => q.offset === 0 && q.limit >= 145))
  )
  check('list pages 145 games and card/Back restores the last tile and loaded depth')

  const offline = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  offline.on('pageerror', (error) => errors.push(error.message))
  await offline.addInitScript(() => {
    let bridge
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const status = value.server.status
        value.server.status = async () => ({ ...(await status()), offline: true, connected: false })
        value.library.roms = async () => {
          throw Error('Offline must use local entries')
        }
      }
    })
  })
  await offline.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  await offline.locator('[data-route="systems"]').click()
  await offline.locator('[data-system]').first().click()
  await offline.locator('.library-grid [data-rom]').first().waitFor()
  assert.equal(await offline.locator('[data-option="all"]').count(), 0)
  await offline.locator('[data-control="layout"] [data-option="list"]').click()
  await offline.locator('.library-row').first().click()
  await offline.locator('.game-screen .game-hero').waitFor()
  assert.equal(await offline.locator('.game-screen [data-action="download"]').count(), 0)
  check('offline systems open local games in both views without a remote ROM query')
  await offline.close()
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: checks.length, checks }))
} catch (error) {
  console.error(
    await page.evaluate(() => ({
      screen: document.querySelector('.app')?.getAttribute('data-screen'),
      selected: document.querySelector('.library-screen')?.getAttribute('data-selected-rom'),
      focused: [...document.querySelectorAll('[data-focused="true"]')].map((e) => ({
        text: e.textContent,
        rom: e.getAttribute('data-rom')
      })),
      queries: window.testQueries
    }))
  )
  throw error
} finally {
  await browser.close()
}
