/** Scale the couch layout to an 900-DIP design height after TV feedback on the Ludo-sized trial.
 * Electron already supplies DIP dimensions; never multiply by the OS DPR again.
 * Keep RomMix's explicit quarter-step override and its existing upper bound. */
export function uiScaleFor(contentHeight: number, chosen = 0): number {
  if (Number.isFinite(chosen) && chosen > 0)
    return Math.min(3, Math.max(1, Math.round(chosen * 4) / 4))
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 1
  return Math.min(3, Math.max(0.75, contentHeight / 900))
}
