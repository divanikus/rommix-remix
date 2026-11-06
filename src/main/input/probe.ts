import { join } from 'node:path'

export function inputProbeEnabled(): boolean {
  return process.env.ROMMIX_INPUT_PROBE === '1'
}

/** Isolate the experimental app without redirecting other applications' XDG paths. */
export function configureInputProbe(app: {
  getPath(name: 'home' | 'appData'): string
  setPath(name: 'userData', value: string): void
  setName(value: string): void
}): void {
  if (!inputProbeEnabled()) return
  app.setName('RomMix Input Probe')
  app.setPath('userData', join(app.getPath('appData'), 'rommix-input-probe'))
  process.env.ROMMIX_HOME = join(
    process.env.XDG_DATA_HOME || join(app.getPath('home'), '.local', 'share'),
    'rommix-input-probe'
  )
  process.env.ROMMIX_NATIVE_GAMEPAD ??= '1'
}
