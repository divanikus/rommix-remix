import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const clipSize =
  process.env.TEST_VIDEO_ASPECT === '4:3'
    ? { width: 320, height: 240 }
    : { width: 320, height: 180 }
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const press = async (selector) => {
  await page.mouse.move(0, 0)
  await page.locator(selector).hover()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
}
const focused = () =>
  page
    .locator('[data-focused=true]')
    .evaluateAll((els) =>
      els.map((e) => ({ action: e.dataset.action, rom: e.dataset.rom, text: e.textContent }))
    )
try {
  await page.addInitScript(() => {
    let bridge
    window.readIds = []
    Object.defineProperty(window, 'rommix', {
      get: () => bridge,
      set: (value) => {
        bridge = value
        const rom = value.library.rom,
          assetUrl = value.system.assetUrl
        window.originalRom = rom
        value.library.rom = async (id) => {
          readIds.push(id)
          const record =
            id === 900001
              ? { ...window.versionBase, id, fs_name: 'Alternate version (Europe).zip' }
              : await rom(id)
          const result = {
            ...record,
            path_video: '/assets/romm/resources/roms/test/video.webm',
            merged_screenshots: [
              ...record.merged_screenshots,
              ...Array.from({ length: 6 }, (_, i) => `test-shot-${i}`)
            ],
            sibling_roms:
              id === 900001
                ? [
                    {
                      id: window.versionBase.id,
                      name: window.versionBase.name,
                      fs_name_no_ext: window.versionBase.fs_name_no_ext
                    }
                  ]
                : [
                    ...record.sibling_roms,
                    { id: 900001, fs_name_no_ext: 'Alternate version (Europe)', name: record.name }
                  ]
          }
          if (id !== 900001) window.versionBase = record
          return result
        }
        value.system.assetUrl = (path) => {
          if (path?.startsWith('test-shot-')) {
            const wide = Number(path.slice(-1)) % 2 === 1
            return (
              'data:image/svg+xml,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${wide ? 180 : 240}"><rect width="100%" height="100%" fill="#203e58"/><text x="40" y="90" fill="white" font-size="30">${wide ? '16:9' : '4:3'}</text></svg>`
              )
            )
          }
          return path === '/assets/romm/resources/roms/test/video.webm'
            ? window.testClip
            : assetUrl(path)
        }
      }
    })
  })
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5274')
  await page.waitForFunction(() => !!window.rommix?.system)
  // A real playable clip generated solely for the test; no copyrighted media.
  await page.evaluate(async ({ width, height }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d'),
      stream = canvas.captureStream(12)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }),
      chunks = []
    const done = new Promise((resolve) => {
      recorder.onstop = resolve
    })
    recorder.ondataavailable = (event) => chunks.push(event.data)
    recorder.start()
    let frame = 0
    const draw = setInterval(() => {
      ctx.fillStyle = frame++ % 2 ? '#173754' : '#254d62'
      ctx.fillRect(0, 0, width, height)
    }, 70)
    await new Promise((resolve) => setTimeout(resolve, 1600))
    recorder.stop()
    await done
    clearInterval(draw)
    stream.getTracks().forEach((track) => track.stop())
    window.testClip = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
  }, clipSize)
  await page.locator('[data-route=systems]').click()
  await page.locator('[data-system]').first().click()
  await page.locator('.library-screen [data-rom]').first().waitFor()
  const ids = await page
    .locator('.library-screen [data-rom]')
    .evaluateAll((els) => els.map((e) => Number(e.dataset.rom)))
  assert(ids.length > 1)
  await press('.library-screen [data-rom]:first-child')
  await page.locator('.game-hero__title').waitFor()
  await page.locator('[data-action=choose-version]').waitFor()
  assert.equal(await page.locator('[data-action=collections] svg.lucide-bookmark').count(), 1)
  assert.equal(await page.locator('[data-action=status] svg.lucide-circle-dashed').count(), 1)
  assert((await page.locator('.game-facts dt').count()) > 0)
  assert(
    await page
      .locator('.game-facts')
      .evaluate((el) => el.getBoundingClientRect().bottom < innerHeight - 50),
    'Compact metadata fits below the cover without scrolling at the TV canvas'
  )
  await page.locator('[data-action=choose-version]').hover()
  await page.mouse.move(0, 0)
  // Keep a real short clip playing while inspecting its controller affordance.
  await page.locator('video').evaluate((v) => {
    v.loop = true
    return v.play()
  })
  await page.waitForFunction(
    () => document.querySelector('.game-video__surface').dataset.playing === 'true'
  )
  const videoIcon = page.locator('[data-action=video-expand] > svg')
  assert.equal(await videoIcon.evaluate((el) => getComputedStyle(el).opacity), '0')
  await page.locator('[data-action=video-expand]').hover()
  assert.equal(await videoIcon.evaluate((el) => getComputedStyle(el).opacity), '1')
  await page.keyboard.press('ArrowUp')
  assert.equal(await videoIcon.evaluate((el) => getComputedStyle(el).opacity), '0')
  await page.locator('[data-action=choose-version]').scrollIntoViewIfNeeded()
  console.log('PASS playing video icon appears only on focus and clears on controller departure')
  const ratio = clipSize.width / clipSize.height
  await page.waitForFunction((expectedRatio) => {
    const r = document.querySelector('.game-video').getBoundingClientRect()
    return Math.abs(r.width / r.height - expectedRatio) < 0.02
  }, ratio)
  const count = await page.locator('.game-overview .shot').count()
  assert.equal(count, ratio < 1.5 ? 6 : 4)
  assert(
    await page
      .locator('.game-overview .shot__image')
      .evaluateAll((es) => es.every((e) => getComputedStyle(e).objectFit === 'contain'))
  )
  await press('.game-overview .shot:last-child')
  await page.locator('.viewer').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(
    await page.locator('.game-overview .shot:last-child').getAttribute('data-focused'),
    'true'
  )
  console.log('PASS native video aspect,', count, 'uncropped overview shots and viewer return')
  const shotDir = process.env.SCREENSHOT_DIR
  if (shotDir) {
    await mkdir(shotDir, { recursive: true })
    await page.screenshot({ path: `${shotDir}/game-card-overview-${clipSize.height}.png` })
  }
  await page.keyboard.press('Tab')
  await page.waitForTimeout(350)
  const second = await page.locator('.game-hero__title').textContent()
  assert.equal(await page.locator('.game-navigation__current').textContent(), second)
  await page.keyboard.press('Escape')
  await page.locator('.library-screen').waitFor()
  await page.waitForTimeout(350)
  assert.equal((await focused()).find((item) => item.rom)?.rom, String(ids[1]))
  console.log('PASS LB/RB neighbors and B return to the selected source row')
  await page.keyboard.press('Enter')
  await page.locator('[data-action=choose-version]').waitFor()
  await press('[data-action=choose-version]')
  await page.locator('.overlay [data-rom]').first().waitFor()
  assert.equal(await page.locator('[data-action=cancel-version] svg').count(), 0)
  await page.keyboard.press('Tab')
  await page.keyboard.press('PageDown')
  assert.equal(await page.locator('.overlay').count(), 1)
  assert.equal(await page.locator('[data-tab=overview][data-active=true]').count(), 1)
  const beforeCancel = await page.locator('.game-version strong').textContent()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.overlay').count(), 0)
  assert.equal(await page.locator('.game-version strong').textContent(), beforeCancel)
  assert((await focused()).some((item) => item.action === 'choose-version'))
  assert.equal(await page.locator('[data-tab=overview][data-active=true]').count(), 1)
  await page.keyboard.press('Enter')
  await page.locator('.overlay [data-rom]').first().waitFor()
  assert((await focused()).some((item) => item.text.includes('Alternate version')))
  await page.keyboard.press('Enter')
  await page.waitForFunction(
    () =>
      document.querySelector('.game-version strong')?.textContent ===
      'Alternate version (Europe).zip'
  )
  await page.keyboard.press('Escape')
  await page.locator('.library-screen').waitFor()
  await page.waitForTimeout(500)
  console.log(
    'PASS B cancels without leaving the card; explicit version chooser and single-step Back after a version change'
  )
  await page.keyboard.press('Enter')
  await page.locator('[data-tab=overview]').click()
  await press('[data-action=video-expand]')
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return video && !video.paused && video.currentTime > 0
  })
  assert.equal(await page.locator('video').count(), 1)
  const title = await page.locator('.game-hero__title').textContent()
  await page.keyboard.press('Tab')
  assert.equal(await page.locator('.game-hero__title').textContent(), title)
  await press('[data-action=video-play]')
  assert.equal(await page.locator('video').evaluate((video) => video.paused), true)
  await press('[data-action=video-sound]')
  assert.equal(await page.locator('video').evaluate((video) => video.muted), true)
  await page.keyboard.press('Escape')
  await page.locator('.game-video:not(.game-video--expanded)').waitFor()
  assert((await focused()).some((item) => item.action === 'video-expand'))
  await page.keyboard.press('PageDown')
  assert.equal(await page.locator('video').count(), 0)
  console.log('PASS real playback, player focus isolation, pause, sound and tab teardown')
  await page.locator('[data-tab=screenshots]').click()
  await page.waitForTimeout(900)
  assert.equal(await page.locator('video').evaluate((v) => v.paused && v.currentTime === 0), true)
  const tile = await page.locator('.game-video').boundingBox()
  const gallery = await page.locator('.game-media--gallery').boundingBox()
  assert(tile.width < gallery.width / 2)
  await press('[data-action=video-expand]')
  await page.waitForFunction(() => !document.querySelector('video').paused)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(900)
  assert.equal(await page.locator('video').evaluate((v) => v.paused), true)
  assert((await focused()).some((item) => item.action === 'video-expand'))
  console.log('PASS gallery is a normal tile, plays only on A and pauses on B')

  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1280, height: 720 },
    { width: 960, height: 540 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport)
    await page.locator('[data-tab=overview]').click()
    await page.locator('[data-action=choose-version]').scrollIntoViewIfNeeded()
    const geometry = await page.evaluate(() => {
      const rect = (q) => {
        const r = document.querySelector(q).getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height }
      }
      return {
        header: rect('.game-navigation'),
        backdrop: rect('.game-hero > .backdrop'),
        version: rect('.game-version'),
        cover: rect('.game-hero__art'),
        facts: rect('.game-facts'),
        video: rect('.game-video')
      }
    })
    assert(
      Math.abs(geometry.header.bottom - geometry.backdrop.top) < 1,
      'No stripe between header and backdrop'
    )
    assert(geometry.facts.top >= geometry.cover.bottom, 'Facts below cover')
    assert(Math.abs(geometry.facts.left - geometry.cover.left) < 1)
    assert(geometry.version.height <= 44, 'Compact version control')
    assert(geometry.facts.bottom < viewport.height - 60, 'Metadata fits above footer at each scale')
    assert(geometry.video.height >= 220 && geometry.video.height <= 340, 'Bounded overview preview')
    console.log('Layout', viewport.width, JSON.stringify(geometry))

    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false
    )
    assert.equal(
      await page
        .locator('[data-action=choose-version]')
        .evaluate((el) => el.getBoundingClientRect().width > 150),
      true
    )
  }
  assert.deepEqual(errors, [])
  console.log('PASS scaled layouts and no renderer errors')
} finally {
  await browser.close()
}
