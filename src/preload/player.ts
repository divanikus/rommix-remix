import { contextBridge, ipcRenderer } from 'electron'
import { LEAVE_HOLD_MS, type PadState, startHeld } from '../shared/hold.ts'
import type { NativeGamepads, NativePad } from '../shared/native-gamepad.ts'
import { installNativePlayerGamepads } from './player-gamepads.ts'

/**
 * The preload of RomM's player window, which is RomM's page and not RomMix's.
 *
 * The browser player can read controller snapshots, with no general IPC
 * access. The native input source handles Start in the main process. The
 * preload keeps the same exit gesture for Chromium gamepads.
 */

/** The hint element, as far as this file touches it. */
interface Hint {
  textContent: string | null
  style: Record<string, string>
  remove(): void
  setAttribute(name: string, value: string): void
  addEventListener(type: 'click', listener: () => void): void
}
interface HintContainer {
  append(node: Hint): void
}

/**
 * The page globals this file reads, typed here: the preload is built with the
 * main process's types, and pulling in the DOM library for them would retype
 * `Blob` and `fetch` across the whole of the main process.
 */
const page = globalThis as unknown as {
  location: { pathname: string }
  navigator: { getGamepads(): readonly (PadState | null)[] }
  document: {
    hasFocus(): boolean
    createElement(tag: 'button'): Hint
    documentElement: HintContainer
    fullscreenElement: HintContainer | null
    addEventListener(type: 'fullscreenchange', listener: () => void): void
  }
  requestAnimationFrame(callback: (now: number) => void): number
}

let native: NativeGamepads | null = null
let received = -Infinity
let armed = false
const browserPlayer = process.isMainFrame && /\/rom\/\d+\/ejs\/?$/.test(page.location.pathname)
// Give the Linux helper a chance to report before the emulator assigns
// Chromium's devices to players during a document reload.
const initialWait = browserPlayer && process.platform === 'linux' ? performance.now() + 600 : 0
function readNative(): NativePad[] | null {
  const now = performance.now()
  if (native === null && now < initialWait) return []
  if (!native?.available || now - received > 1000) {
    armed = false
    return null
  }
  if (!page.document.hasFocus()) {
    armed = false
    return []
  }
  // Do not deliver the button that opened the player until it is released.
  if (!armed) armed = native.pads.every((pad) => !pad.buttons.some(Boolean))
  return armed ? native.pads : []
}

if (browserPlayer) {
  ipcRenderer.on('player:native-gamepads', (_event, state: NativeGamepads) => {
    native = state
    received = performance.now()
  })
  contextBridge.exposeInMainWorld('rommixPlayerPads', { read: readNative })
  contextBridge.executeInMainWorld({ func: installNativePlayerGamepads })
}

let since: number | null = null
let asked = false
function requestLeave(reason: 'start' | 'button'): void {
  if (asked) return
  asked = true
  ipcRenderer.send('player:leave', reason)
}

function poll(now: number): void {
  const held =
    readNative() === null &&
    page.navigator.getGamepads().some((pad) => pad !== null && startHeld(pad))
  if (!held) since = null
  else if (since === null) since = now
  else if (now - since >= LEAVE_HOLD_MS) requestLeave('start')
  page.requestAnimationFrame(poll)
}
page.requestAnimationFrame(poll)

/**
 * Show the way back when the page opens. The hint works with a pointer
 * while visible and stays out of the page's keyboard and controller focus order.
 */
const HINT_MS = 6000
let hint: Hint | null = null
let hideTimer: ReturnType<typeof setTimeout> | undefined
function mountHint(): void {
  if (hint) (page.document.fullscreenElement ?? page.document.documentElement).append(hint)
}
page.document.addEventListener('fullscreenchange', mountHint)
ipcRenderer.on('player:hint', (_event, text: string) => {
  if (!hint) {
    hint = page.document.createElement('button')
    hint.setAttribute('type', 'button')
    hint.setAttribute('tabindex', '-1')
    hint.setAttribute('data-rommix-player-exit', 'true')
    hint.addEventListener('click', () => requestLeave('button'))
    Object.assign(hint.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      zIndex: '2147483647',
      maxWidth: 'calc(100% - 24px)',
      padding: '6px 10px',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      borderRadius: '8px',
      background: 'rgba(11, 13, 19, 0.88)',
      color: '#ffffff',
      cursor: 'pointer',
      font: '600 13px system-ui, sans-serif'
    })
  }
  hint.textContent = text
  mountHint()
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    hint?.remove()
    hint = null
  }, HINT_MS)
})
