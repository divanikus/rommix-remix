/** Scale the couch layout to a 900-DIP design height, with readable handheld sizing.
 * Electron already supplies DIP dimensions; never multiply by the OS DPR again.
 * Keep RomMix's explicit quarter-step override and its existing upper bound. */
export function uiScaleFor(contentHeight: number, chosen = 0): number {
  if (Number.isFinite(chosen) && chosen > 0)
    return Math.min(3, Math.max(1, Math.round(chosen * 4) / 4))
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 1
  // Blend the existing 80% at 720 DIP into 100% at 800 DIP. Keep that
  // floor until the usual couch scale reaches 100% on its own.
  const handheld = Math.min(1, 0.8 + 0.2 * ((contentHeight - 720) / 80))
  return Math.min(3, Math.max(0.75, contentHeight / 900, handheld))
}
