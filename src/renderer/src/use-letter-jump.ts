import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameTile } from './components'
import { useAction, useFocusContext } from './input/focus'
import { letterTarget, titleLetter } from './library-letter'

/** Resolve one jump at a time across paged metadata; never queue held presses. */
export function useLetterJump({
  tiles,
  selected,
  more,
  loading,
  error,
  loadMore
}: {
  tiles: GameTile[]
  selected?: number
  more: boolean
  loading: boolean
  error: string | null
  loadMore: () => void
}): {
  flash?: { letter: string; sequence: number }
  pending: boolean
  cancel: () => void
} {
  const { setFocus, getFocusedElement, subscribeFocus, subscribeMove } = useFocusContext()
  type Jump = { romId: number; direction: -1 | 1 }
  const request = useRef<Jump | null>(null)
  const [jump, setJump] = useState<Jump | null>(null)
  const [flash, setFlash] = useState<{ letter: string; sequence: number }>()
  const cancel = useCallback(() => {
    request.current = null
    setJump(null)
  }, [])
  useEffect(() => subscribeMove(cancel), [subscribeMove, cancel])
  useEffect(
    () =>
      subscribeFocus(() => {
        const element = getFocusedElement()
        if (
          request.current &&
          (!element?.closest('[data-focus-collection]') ||
            Number(element.dataset.rom) !== request.current.romId)
        )
          cancel()
      }),
    [subscribeFocus, getFocusedElement, cancel]
  )
  const start = (direction: -1 | 1): void => {
    const element = getFocusedElement()
    if (!element?.closest('[data-focus-collection]')) return
    if (request.current?.direction === direction) return
    const romId = Number(element.dataset.rom) || selected
    if (romId === undefined) return
    request.current = { romId, direction }
    setJump(request.current)
  }
  useAction('letterPrevious', () => start(-1))
  useAction('letterNext', () => start(1))
  useEffect(() => {
    if (!jump || request.current !== jump) return
    if (error) {
      cancel()
      return
    }
    const index = tiles.findIndex((tile) => tile.romId === jump.romId)
    if (index < 0) {
      cancel()
      return
    }
    const target = letterTarget(
      tiles.map((tile) => tile.sortTitle ?? tile.title),
      index,
      jump.direction,
      more
    )
    if (target === null) {
      if (!loading) loadMore()
      return
    }
    let disposed = false
    // New-page cards register before this microtask, including StrictMode replay.
    queueMicrotask(() => {
      if (disposed || request.current !== jump) return
      cancel()
      setFocus(`library-game-${tiles[target].romId}`)
      setFlash((previous) => ({
        letter: titleLetter(tiles[target].sortTitle ?? tiles[target].title),
        sequence: (previous?.sequence ?? 0) + 1
      }))
    })
    return () => {
      disposed = true
    }
  }, [jump, tiles, more, loading, error, loadMore, setFocus, cancel])
  return { flash, pending: !!jump, cancel }
}
