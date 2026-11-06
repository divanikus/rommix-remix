import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { NO_NATIVE_GAMEPADS, parseNativeGamepads } from '../../shared/native-gamepad.ts'
import type { NativeGamepads } from '../../shared/native-gamepad.ts'

/** A fixed helper, optional and isolated from emulator processes and configuration. */
export function startNativeGamepads(
  script: string,
  publish: (state: NativeGamepads) => void,
  report: (message: string) => void
): { current: () => NativeGamepads; stop: () => void } {
  if (process.platform !== 'linux' || process.env.ROMMIX_NATIVE_GAMEPAD !== '1') {
    return { current: () => NO_NATIVE_GAMEPADS, stop: () => undefined }
  }
  const child = spawn('python3', ['-I', '-u', script], { stdio: ['pipe', 'pipe', 'pipe'] })
  return watchNativeGamepads(child, publish, report)
}

export function watchNativeGamepads(
  child: ChildProcessWithoutNullStreams,
  publish: (state: NativeGamepads) => void,
  report: (message: string) => void
): { current: () => NativeGamepads; stop: () => void } {
  let state = NO_NATIVE_GAMEPADS
  let first = true
  let pending = ''
  let received = Date.now()
  let stopped = false
  const update = (next: NativeGamepads): void => {
    if (first || next.available !== state.available) {
      report(
        next.available ? 'native gamepad input ready' : 'native input unavailable; using Chromium'
      )
    }
    state = next
    first = false
    publish(state)
  }
  const stop = (): void => {
    if (stopped) return
    stopped = true
    clearInterval(watchdog)
    child.stdin.end()
    child.kill()
    update(NO_NATIVE_GAMEPADS)
  }
  // A crashed or wedged helper must never leave a held button in the renderer.
  const watchdog = setInterval(() => {
    if (Date.now() - received > 1000) {
      report('native gamepad helper timed out')
      stop()
    }
  }, 250)
  watchdog.unref()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (data: string) => {
    if (stopped) return
    pending += data
    if (pending.length > 65536) {
      report('native gamepad helper exceeded frame limit')
      stop()
      return
    }
    let newline: number
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, newline)
      pending = pending.slice(newline + 1)
      let parsed: NativeGamepads | null = null
      try {
        parsed = parseNativeGamepads(JSON.parse(line))
      } catch {
        /* invalid helper frame */
      }
      if (!parsed) {
        report('invalid native gamepad snapshot')
        stop()
        return
      }
      received = Date.now()
      update(parsed)
    }
  })
  // Drain diagnostics without printing device paths or an unbounded traceback.
  child.stderr.resume()
  child.stdin.on('error', stop)
  child.on('error', () => {
    report('native gamepad helper could not start (python3 required)')
    stop()
  })
  child.on('exit', () => {
    if (!stopped) {
      report('native gamepad helper exited')
      stop()
    }
  })
  return { current: () => state, stop }
}
