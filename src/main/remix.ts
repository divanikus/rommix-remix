import { join } from 'node:path'

/** Keep the fork's Chromium state and singleton lock separate from RomMix. */
export function configureRemix(app: {
  getPath(name: 'appData'): string
  setPath(name: 'userData', value: string): void
  setName(value: string): void
}): void {
  app.setName('RomMix-Remix')
  app.setPath('userData', join(app.getPath('appData'), 'rommix-remix'))
  if (process.platform === 'linux') process.env.ROMMIX_NATIVE_GAMEPAD ??= '1'
}
