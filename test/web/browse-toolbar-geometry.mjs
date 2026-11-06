import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const samples = []
const sample = async (name) => {
  const field = page.locator('.library-toolbar input')
  await field.waitFor()
  await page.waitForTimeout(90)
  const state = await field.evaluate((e) => {
    const r = e.getBoundingClientRect(),
      content = e.closest('.content'),
      c = content.getBoundingClientRect()
    return {
      top: r.top,
      height: r.height,
      width: r.width,
      localTop: r.top - c.top + content.scrollTop,
      scroll: content.scrollTop,
      toolbarHeight: e.closest('.library-toolbar').getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    }
  })
  samples.push({ name, ...state })
}
const route = async (name) => {
  await page.locator(`[data-route=${name}]`).click()
  await page.locator(`.app[data-screen=${name}]`).waitFor()
}
try {
  await page.addInitScript(() => {
    let bridge
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const collections = value.library.collections,
          roms = value.library.roms
        value.library.collections = async () =>
          (await collections()).map((c) => ({
            ...c,
            name: 'A collection with a deliberately long name that should never move the search field '.repeat(
              3
            )
          }))
        value.library.roms = async (q) => {
          await new Promise((r) => setTimeout(r, 350))
          return roms(q)
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5274')
  await page.waitForFunction(() => !!window.rommix?.system)
  await page.evaluate(() => rommix.system.updateSettings({ uiScale: 1 }))
  const viewports = process.env.RECORD_GEOMETRY
    ? [{ width: 1600, height: 900 }]
    : [
        { width: 1600, height: 900 }, // Auto at 1080p/4K
        { width: 1920, height: 1080 }, // 1080p at 100%
        { width: 1536, height: 864 }, // 125%
        { width: 1280, height: 720 }, // 150%
        { width: 960, height: 540 }, // 200%
        { width: 2560, height: 1440 }, // 4K at 150%
        { width: 3072, height: 1728 }, // 4K at 125%
        { width: 3840, height: 2160 } // 4K at 100%
      ]
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    samples.length = 0
    await route('systems')
    await sample('systems-loading')
    await page.locator('[data-system]').first().waitFor()
    await sample('systems-grid')
    await page.locator('[data-control=systems-layout] [data-option=list]').click()
    await sample('systems-list')
    await page.locator('[data-system]').first().click()
    await sample('platform-loading')
    await page.locator('.library-screen [data-rom]').first().waitFor()
    await page.locator('[data-control=layout] [data-option=grid]').click()
    await sample('platform-grid')
    await page.locator('[data-control=layout] [data-option=list]').click()
    await sample('platform-list')
    await page.locator('[data-platform-slot=next]').click()
    await sample('platform-next-loading')
    await page.waitForTimeout(500)
    await sample('platform-next-ready')
    await page.keyboard.press('Escape')
    await route('collections')
    await sample('collections-index')
    await page.locator('[data-collection]').first().click()
    await page.locator('.library-screen').waitFor()
    await sample('collection-list')
    await page.locator('[data-control=layout] [data-option=grid]').click()
    await sample('collection-grid')
    await route('library')
    await page.locator('.search-prompt').waitFor()
    await sample('search-empty')
    await page.locator('[data-field=library-search]').fill('super')
    await sample('search-debounce')
    await page.waitForTimeout(1000)
    await sample('search-results')
    await page.locator('[data-control=layout] [data-option=list]').click()
    await sample('search-list')
    await page.locator('[data-field=library-search]').fill('zzzznotfound')
    await page.waitForTimeout(1000)
    await sample('search-no-results')
    await page.locator('[data-field=library-search]').fill('')
    await page.locator('.search-prompt').waitFor()
    await sample('search-cleared')
    await page.keyboard.press('Escape') // Leave the input caret.
    if (process.env.RECORD_GEOMETRY) console.log(JSON.stringify({ viewport, samples }))
    if (!process.env.RECORD_GEOMETRY) {
      assert.ok(
        Math.max(...samples.map((s) => s.localTop)) - Math.min(...samples.map((s) => s.localTop)) <
          1,
        'Search must have the same offset in every browse view'
      )
      assert.ok(
        Math.max(...samples.map((s) => s.height)) - Math.min(...samples.map((s) => s.height)) < 1,
        'Search height must stay stable'
      )
      assert.equal(
        samples.some((s) => s.overflow),
        false
      )
      console.log(
        `PASS ${viewport.width}×${viewport.height}: ${samples.length} browse states, search top ${samples[0].top}, height ${samples[0].height}`
      )
    }
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
