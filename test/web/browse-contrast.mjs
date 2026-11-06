import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const contrast = async (button) =>
  button.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.canvas.width = ctx.canvas.height = 1
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r / 255, g / 255, b / 255, a / 255]
    }
    const blend = (front, back) =>
      front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3]))
    const chain = []
    for (let e = element; e; e = e.parentElement) chain.unshift(e)
    let background = [1, 1, 1]
    for (const e of chain) background = blend(rgba(getComputedStyle(e).backgroundColor), background)
    const foreground = blend(
      rgba(getComputedStyle(element.querySelector('svg') ?? element).color),
      background
    )
    const luminance = (rgb) =>
      rgb
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0)
    const [lighter, darker] = [luminance(background), luminance(foreground)].sort((a, b) => b - a)
    return (lighter + 0.05) / (darker + 0.05)
  })
try {
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5274/')
  // Measure settled theme colors, not an intermediate theme-change transition.
  await page.addStyleTag({
    content: '*, ::before, ::after { transition: none !important; animation: none !important; }'
  })
  assert.match(await page.title(), /demo/i)
  await page.locator('.continue-card').waitFor()
  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().waitFor()
  for (const screen of ['systems', 'library']) {
    if (screen === 'library') {
      await page.locator('[data-system]').first().click()
      await page.locator('.library-grid .card').first().waitFor()
    }
    for (const theme of ['midnight', 'daylight', 'c64', 'gameboy', 'paper']) {
      await page.evaluate((name) => {
        document.documentElement.dataset.theme = name
      }, theme)
      for (const control of await page.locator('.library-control').all()) {
        for (const active of ['false', 'true']) {
          const button = control.locator(`[data-option][data-active=${active}]`).first()
          if (!(await button.count())) continue
          await button.hover()
          assert.equal(await button.getAttribute('data-focused'), 'true')
          const ratio = await contrast(button)
          assert.ok(
            ratio >= 3,
            `${screen}/${theme}/${await button.getAttribute('data-option')}, active=${active}: contrast ${ratio.toFixed(2)}`
          )
        }
      }
      console.log(`PASS ${screen}/${theme}: active and inactive focused controls stay legible`)
    }
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'midnight'
  })
  await page.locator('[data-control=layout] [data-option=list]').hover()
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/browse-contrast.png` })
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
