import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const press = async (selector) => {
  await page.mouse.move(0, 0)
  await page.locator(selector).hover()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(120)
}
const mark = async (filled) => {
  await page.waitForFunction(
    (on) => document.querySelector('[data-action=collections]')?.dataset.on === String(on),
    filled
  )
}
const status = async (icon) => {
  await page.locator(`[data-action=status] svg.lucide-${icon}`).waitFor()
}
try {
  await page.addInitScript(() => {
    let bridge
    window.failStatus = false
    window.failMembership = false
    window.firstGame = null
    window.shelves = [
      { id: 1, is_favorite: true, is_virtual: false, name: 'Favorites', rom_ids: [] },
      { id: 2, is_favorite: false, is_virtual: true, name: 'Virtual', rom_ids: [] },
      { id: 3, is_favorite: false, is_virtual: false, name: 'Weekend', rom_ids: [] },
      { id: 4, is_favorite: false, is_virtual: false, name: 'Together', rom_ids: [] }
    ]
    const statuses = new Map()
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const rom = value.library.rom
        value.library.rom = async (id) => {
          if (!firstGame) {
            firstGame = id
            shelves[0].rom_ids = [id]
            shelves[1].rom_ids = [id]
          }
          const result = await rom(id)
          return { ...result, rom_user: { ...result.rom_user, status: statuses.get(id) ?? null } }
        }
        value.library.collections = async () =>
          shelves.map((s) => ({
            ...s,
            rom_ids: [...s.rom_ids],
            rom_count: s.rom_ids.length,
            description: '',
            path_cover_small: null,
            path_cover_large: null,
            path_covers_small: [],
            path_covers_large: []
          }))
        value.library.setStatus = async (id, next) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          if (failStatus) throw Error('Status refused')
          statuses.set(id, next)
        }
        value.library.setCollection = async (id, collectionId, member) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          if (failMembership) throw Error('Membership refused')
          const s = shelves.find((entry) => entry.id === collectionId)
          s.rom_ids = member ? [...new Set([...s.rom_ids, id])] : s.rom_ids.filter((n) => n !== id)
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5275')
  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-screen [data-rom]').first().waitFor()
  await press('.library-screen [data-rom]:first-child')
  await status('circle-dashed')
  assert.equal(await page.locator('[data-action=game-back]').count(), 0)
  for (const width of [1280, 1600, 1920]) {
    await page.setViewportSize({ width, height: (width * 9) / 16 })
    const position = await page.locator('.game-navigation__current').evaluate((el) => {
      const r = el.getBoundingClientRect(),
        h = el.closest('header').getBoundingClientRect()
      return { center: r.left + r.width / 2, screen: innerWidth / 2, height: h.height }
    })
    assert(Math.abs(position.center - position.screen) < 1)
    assert.equal(position.height, 58)
  }
  await page.setViewportSize({ width: 1600, height: 900 })
  await mark(false) // Favourites and virtual membership must not fill this bookmark.
  const choices = [
    ['incomplete', 'timer'],
    ['finished', 'flag-triangle-right'],
    ['completed_100', 'trophy'],
    ['retired', 'flag-off'],
    ['never_playing', 'ban'],
    ['none', 'circle-dashed']
  ]
  for (const [value, icon] of choices) {
    await press('[data-action=status]')
    assert.equal(await page.locator(`[data-status=${value}] svg.lucide-${icon}`).count(), 1)
    await press(`[data-status=${value}]`)
    await status(icon)
    assert.equal(await page.locator('[data-action=status]').getAttribute('data-focused'), 'true')
  }
  await page.evaluate(() => {
    failStatus = true
  })
  await press('[data-action=status]')
  await press('[data-status=finished]')
  await status('circle-dashed')
  await page.evaluate(() => {
    failStatus = false
  })
  await press('[data-action=collections]')
  assert.equal(await page.locator('[data-collection]').count(), 2)
  await press('[data-collection="3"]')
  await mark(true)
  await press('[data-collection="4"]')
  await press('[data-collection="3"]')
  await mark(true) // One collection remains.
  await page.evaluate(() => {
    failMembership = true
  })
  await press('[data-collection="4"]')
  await page.getByText('Membership refused', { exact: true }).waitFor()
  await mark(true) // A rejected removal must not clear the bookmark.
  await page.evaluate(() => {
    failMembership = false
  })
  await page.keyboard.press('Escape')
  await mark(true)
  const fill = await page.locator('[data-action=collections] svg').evaluate((el) => {
    const s = getComputedStyle(el)
    return { fill: s.fill, color: s.color }
  })
  assert.equal(fill.fill, fill.color)
  await press('[data-action=status]')
  await press('[data-status=completed_100]')
  await page.keyboard.press('Tab')
  await mark(false)
  await status('circle-dashed')
  await page.keyboard.press('Shift+Tab')
  await status('trophy')
  await mark(true) // State is restored from the server on return to this game.
  await press('[data-action=collections]')
  await press('[data-collection="4"]')
  await mark(false)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.locator('.library-screen [data-rom][data-focused=true]').waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'PASS centered header without Back; B/source return; six status icons and rollback; confirmed multi-collection membership, exclusions, failure and neighbor state'
  )
} finally {
  await browser.close()
}
