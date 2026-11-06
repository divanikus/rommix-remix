import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
try {
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273')
  await page.locator('.topbar').waitFor()
  await page.evaluate(async () => {
    const seed = (await window.rommix.library.roms({ limit: 1 })).items[0]
    const items = Array.from({ length: 120 }, (_, i) => ({
      ...seed,
      id: 10000 + i,
      name: `Game ${String(i).padStart(3, '0')}`,
      sibling_roms: [],
      name_sort_key: `Game ${String(i).padStart(3, '0')}`
    }))
    window.pageAttempts = 0
    window.failPage = true
    window.failInitial = true
    window.initialAttempts = 0
    window.rommix.library.roms = async (query) => {
      const offset = query.offset ?? 0
      window.testPlatform ??= query.platform_ids?.[0]
      if (
        offset === 0 &&
        query.search_term === 'initial failure' &&
        query.platform_ids?.[0] === window.testPlatform
      ) {
        window.initialAttempts++
        if (window.failInitial) throw Error('Initial page temporarily unavailable')
      }
      if (offset > 0) {
        window.pageAttempts++
        await new Promise((r) => setTimeout(r, 20))
        if (window.failPage) throw Error('Page temporarily unavailable')
      }
      return {
        items: items.slice(offset, offset + query.limit),
        total: items.length,
        offset,
        limit: query.limit
      }
    }
  })
  await page.locator('[data-route="systems"]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-screen .notice--error').waitFor()
  await page.waitForTimeout(300)
  assert.equal(
    await page.evaluate(() => window.pageAttempts),
    1,
    'failed lookahead must not retry continuously'
  )
  assert.equal(await page.locator('[data-focus-collection] [data-rom]').count(), 60)
  await page.evaluate(() => {
    window.failPage = false
  })
  await page.locator('[data-action="retry-library"]').click()
  await page.waitForFunction(
    () => document.querySelectorAll('[data-focus-collection] [data-rom]').length === 120
  )
  assert.equal(await page.evaluate(() => window.pageAttempts), 2)
  assert.equal(await page.locator('.library-screen .notice--error').count(), 0)
  console.log('PASS failed lookahead stops, retains existing games and retries once on request')
  await page.locator('[data-field="library-search"]').fill('initial failure')
  await page.locator('.library-screen .notice--error').waitFor()
  assert.equal(await page.locator('[data-focus-collection] [data-rom]').count(), 0)
  await page.evaluate(() => {
    window.failInitial = false
  })
  await page.locator('[data-action="retry-library"]').click()
  await page.waitForFunction(
    () => document.querySelectorAll('[data-focus-collection] [data-rom]').length >= 60
  )
  assert.equal(await page.locator('.library-screen .notice--error').count(), 0)
  assert.equal(await page.evaluate(() => window.initialAttempts), 2)
  console.log('PASS initial-page failure hides stale games and retries the new query')
} finally {
  await browser.close()
}
