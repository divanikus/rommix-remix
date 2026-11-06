import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const capture = async (name) => {
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` })
}
const open = async (route) => {
  await page.keyboard.press('m')
  await page.locator(`[data-action=open-${route}]`).click()
  await page.locator(`.app[data-screen=${route}]`).waitFor()
}
const sizes = (selector) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        font: parseFloat(style.fontSize),
        height: element.getBoundingClientRect().height,
        padding: parseFloat(style.paddingTop)
      }
    })
try {
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5273/')
  assert.match(await page.title(), /demo/i)
  await page.locator('.continue-card').waitFor()
  // Read the unmodified upstream theme, not a second hand-written palette.
  const themeSource = readFileSync(
    new URL('../../src/renderer/src/styles/themes/midnight.css', import.meta.url),
    'utf8'
  )
  const expected = Object.fromEntries(
    [...themeSource.matchAll(/(--[\w-]+):\s*([^;]+);/g)]
      .filter(([, key]) =>
        /^--(bg|surface|border|text|accent|danger|success|warning|kind)/.test(key)
      )
      .map(([, key, value]) => [key, value.trim()])
  )
  for (const explicit of [false, true]) {
    await page.evaluate((useName) => {
      if (useName) document.documentElement.dataset.theme = 'midnight'
      else delete document.documentElement.dataset.theme
    }, explicit)
    const actual = await page.evaluate((keys) => {
      const style = getComputedStyle(document.documentElement)
      return Object.fromEntries(keys.map((key) => [key, style.getPropertyValue(key).trim()]))
    }, Object.keys(expected))
    assert.deepEqual(actual, expected)
  }
  await capture('fidelity-midnight-home')
  console.log(
    'PASS default and explicit Midnight match the upstream palette, including status colours'
  )

  const cover = await sizes('.continue-card__cover')
  const header = await sizes('.app-header')
  for (const theme of ['midnight', 'paper', 'arcade']) {
    await page.evaluate((selectedTheme) => {
      document.documentElement.dataset.theme = selectedTheme
    }, theme)
    await open('settings')
    await page.locator('.setting').first().waitFor()
    const dense = await sizes('.setting__label')
    const button = await sizes('.setting .btn')
    const hints = await sizes('.hints')
    await page.locator('.app').evaluate((element) => {
      element.dataset.utility = 'false'
    })
    const original = await sizes('.setting__label')
    const originalButton = await sizes('.setting .btn')
    const originalHints = await sizes('.hints')
    await page.locator('.app').evaluate((element) => {
      element.dataset.utility = 'true'
    })
    assert.ok(Math.abs(dense.font / original.font - 5 / 6) < 0.002)
    assert.ok(button.height < originalButton.height && button.padding < originalButton.padding)
    assert.deepEqual(hints, originalHints)
    assert.equal((await sizes('.app-header')).height, header.height)
    if (theme === 'midnight') await capture('fidelity-settings')
    await page.locator('[data-action=utility-back]').click()
    await page.locator('.continue-card').waitFor()
    assert.equal((await sizes('.continue-card__cover')).height, cover.height)
  }
  console.log(
    'PASS utility text and controls are denser across themes; header, footer and Home size stay fixed'
  )

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'midnight'
  })
  for (const route of ['bios', 'emulators', 'downloads']) {
    await open(route)
    await page.locator('.content').waitFor()
    assert.ok(Math.abs((await sizes('.content')).font - (17 * 5) / 6) < 0.01)
    if (route !== 'downloads') {
      await page.locator('.group__header').first().waitFor()
      assert.equal((await sizes('.group__header')).padding, 10)
      await page.locator('.group__header').first().click()
    }
    await capture(`fidelity-${route}`)
    await page.keyboard.press('Escape')
    await page.locator('.continue-card').waitFor()
  }
  console.log('PASS BIOS, Emulators and Downloads share utility density and retain Back navigation')

  await open('settings')
  for (const width of [390, 950, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    await page.locator('.content').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const back = await page.locator('[data-action=utility-back]').boundingBox()
    assert.ok(back.y >= 0 && back.y + back.height <= 58)
  }
  assert.deepEqual(errors, [])
  console.log('PASS dense utility layouts keep a reachable header and no horizontal page overflow')
} finally {
  await browser.close()
}
