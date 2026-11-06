import { useCallback, useEffect, useRef, useState } from 'react'
import type { RomUserStatus } from '@shared/types'
import { useApp, useI18n } from '../../state'
import type { ToastSubject } from '../../state'

/**
 * Favourite/status edits and confirmed collection membership for this version.
 * These belong to RomM, not the copy that happens to be on this disk.
 *
 * Both live on RomM, which is the whole point of them: a game favourited or
 * marked finished from the sofa says the same thing in a browser and on the
 * handheld. And both are shown as set before the server has agreed — the round
 * trip is a collection edit that takes a moment, and a control that does
 * nothing for that long reads as one that missed the press. A refusal puts the
 * previous answer back, and `app:error` has already said why.
 */
export function useGameMarks(
  romId: number,
  subjectOf: () => ToastSubject
): {
  /** Null until RomM has been asked, which is what the button waits on. */
  favourite: boolean | null
  inCollection: boolean | null
  setInCollection: (member: boolean) => void
  toggleFavourite: () => Promise<void>
  status: RomUserStatus | null
  /**
   * The status the fetched ROM arrived carrying.
   *
   * Handed in rather than fetched here: the screen is already asking for the
   * ROM, and the overlay it belongs to comes back on that same response. Asking
   * again would be a second round trip for something already in hand.
   */
  setStatus: (status: RomUserStatus | null) => void
  chooseStatus: (next: RomUserStatus | null) => Promise<void>
} {
  const { t } = useI18n()
  const { notify, offline } = useApp()
  const [favourite, setFavourite] = useState<boolean | null>(null)
  const [inCollection, updateInCollection] = useState<boolean | null>(null)
  const membershipRevision = useRef(0)
  const setInCollection = useCallback((member: boolean) => {
    membershipRevision.current += 1
    updateInCollection(member)
  }, [])
  const [status, setStatus] = useState<RomUserStatus | null>(null)

  useEffect(() => {
    setFavourite(null)
    updateInCollection(null)
    if (offline !== false) return
    let alive = true
    const revision = ++membershipRevision.current
    // Favourite already reads this endpoint. Share that answer instead of
    // fetching every collection twice when the game opens.
    void window.rommix.library
      .collections()
      .then((collections) => {
        if (!alive) return
        setFavourite(
          collections.some((entry) => entry.is_favorite && entry.rom_ids.includes(romId))
        )
        if (revision === membershipRevision.current)
          updateInCollection(
            collections.some(
              (entry) => !entry.is_virtual && !entry.is_favorite && entry.rom_ids.includes(romId)
            )
          )
      })
      .catch(() => {
        // Unknown membership is not evidence for a filled bookmark.
      })
    return () => {
      alive = false
    }
  }, [romId, offline])

  const toggleFavourite = async (): Promise<void> => {
    if (favourite === null) return
    const next = !favourite
    setFavourite(next)
    try {
      const settled = await window.rommix.library.setFavourite(romId, next)
      setFavourite(settled)
      // Said because the change is on the *server*: the filled heart only
      // proves the button was pressed, and this is the confirmation that RomM
      // and the Favourites shelf now agree with it.
      notify(settled ? t('game.favouriteAdded') : t('game.favouriteRemoved'), 'ok', subjectOf())
    } catch {
      setFavourite(!next)
    }
  }

  const chooseStatus = async (next: RomUserStatus | null): Promise<void> => {
    const previous = status
    if (next === previous) return
    setStatus(next)
    try {
      await window.rommix.library.setStatus(romId, next)
      // Said because the change is on the server, not here: this is what
      // confirms a browser and another device now agree.
      notify(
        next ? t('status.set', { status: t(`status.${next}`) }) : t('status.cleared'),
        'ok',
        subjectOf()
      )
    } catch {
      setStatus(previous)
    }
  }

  return {
    favourite,
    toggleFavourite,
    status,
    setStatus,
    chooseStatus,
    inCollection,
    setInCollection
  }
}
