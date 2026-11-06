import { useEffect, useState, type JSX } from 'react'
import { hasMorePages } from '@shared/types'
import { FocusButton, tileFromRom } from '../../components'
import { gameBrowse } from '../../game-browse'
import { FocusZone, useAction, useFocusContext, useKeyLabel } from '../../input/focus'
import { useApp, useI18n } from '../../state'

/** Fixed header slots; shoulders walk the source view, triggers belong to tabs. */
export function GameNavigation(): JSX.Element {
  const { route, navigate, revise, installedIds, offline, notify } = useApp()
  const { t } = useI18n()
  const { retainFocus } = useFocusContext()
  const keyLabel = useKeyLabel()
  const [title, setTitle] = useState('')
  const browse = route.name === 'game' ? route.browse : undefined
  const id = route.name === 'game' ? route.romId : undefined
  const current = browse?.items[browse.index]
  const previous = browse?.items[browse.index - 1]
  const next = browse?.items[browse.index + 1]

  useEffect(() => {
    setTitle('')
    if (id === undefined || current) return
    let alive = true
    void window.rommix.library
      .rom(id)
      .then((rom) => {
        if (alive) setTitle(rom.name ?? rom.fs_name)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [id, current])

  // Prefetch the same query, including filters and ordering. No catalogue-wide
  // fallback and no wrap into a different view when the last result is reached.
  useEffect(() => {
    if (
      !browse?.query ||
      !browse.more ||
      offline ||
      browse.index < browse.items.length - 3 ||
      route.name !== 'game'
    )
      return
    let alive = true
    void window.rommix.library
      .roms({ ...browse.query, offset: browse.offset, limit: 60 })
      .then((page) => {
        if (!alive) return
        const extra = gameBrowse(
          page.items.map((rom) => tileFromRom(rom, !!browse.query?.group_by_meta_id)),
          -1,
          installedIds
        )
        const known = new Set(browse.items.map((item) => item.id))
        revise({
          ...route,
          browse: {
            ...browse,
            items: [...browse.items, ...extra.items.filter((item) => !known.has(item.id))],
            offset: browse.offset + page.items.length,
            more: page.items.length > 0 && hasMorePages(page)
          }
        })
      })
      .catch((cause: Error) => {
        if (alive) notify(cause.message, 'error')
      })
    return () => {
      alive = false
    }
  }, [browse, route, id, offline, installedIds, revise, notify])

  const step = (delta: number): void => {
    if (!browse) return
    const index = browse.index + delta
    const item = browse.items[index]
    if (!item) return
    retainFocus(null)
    navigate({ name: 'game', romId: item.openId, browse: { ...browse, index } })
  }
  useAction('tabLeft', () => step(-1))
  useAction('tabRight', () => step(1))

  return (
    <FocusZone id="nav">
      <header className="game-navigation app-header">
        <div className="game-navigation__previous">
          <span className="hint__key">{keyLabel('LB')}</span>
          <FocusButton
            action="game-previous"
            actionLabel={t('game.previousGame')}
            disabled={!previous}
            onSelect={() => step(-1)}
          >
            {previous?.title ?? '—'}
          </FocusButton>
        </div>
        <strong className="game-navigation__current" title={current?.title ?? title}>
          {current?.title ?? title}
        </strong>
        <div className="game-navigation__next">
          <FocusButton
            action="game-next"
            actionLabel={t('game.nextGame')}
            disabled={!next}
            onSelect={() => step(1)}
          >
            {next?.title ?? (browse?.more ? t('app.loading') : '—')}
          </FocusButton>
          <span className="hint__key">{keyLabel('RB')}</span>
        </div>
      </header>
    </FocusZone>
  )
}
