import { type JSX, useEffect, useRef, useState, type Ref } from 'react'
import { FocusGroup, useFocusable, useFocusContext } from '../input/focus'
import { useI18n } from '../state'
import { CoverArt, PlatformIcon } from './art'

/** A game as the library draws it: a cover, a title, a shelf of them. */

// What a tile is and which ROM is behind it are in `tiles.ts` — pure, and
// testable for it. Re-exported because every screen reaches for them here.
export { romToOpen, tileFromInstalled, tileFromRom, tileInstalled, titleOf } from './tiles.ts'
export type { GameTile } from './tiles.ts'

import { tileInstalled, type GameTile } from './tiles.ts'

/** A cover-art tile in a row or grid. */
export function GameCard({
  tile,
  installed,
  onSelect,
  onHighlight,
  focusId,
  landscape = false,
  showPlatform = false,
  autoFocus = false
}: {
  tile: GameTile
  installed: boolean
  onSelect: () => void
  onHighlight?: () => void
  focusId?: string
  landscape?: boolean
  showPlatform?: boolean
  /** Take the highlight on arrival: the card a game was opened from. */
  autoFocus?: boolean
}): JSX.Element {
  const { t } = useI18n()
  const { isFocused } = useFocusContext()
  const { ref, props, focused } = useFocusable({
    id: focusId,
    onSelect,
    autoFocus,
    actionLabel: t('action.open')
  })
  useEffect(() => {
    if (focused && (!focusId || isFocused(focusId))) onHighlight?.()
  }, [focused, focusId, isFocused, onHighlight])

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      className={`card ${landscape ? 'card--scene' : ''}`}
      // Which game this is, for `npm run test:app` — the title is the server's
      // and a test that matched on it would be asserting against somebody's
      // library rather than against RomMix. See `data-action` on FocusButton.
      data-rom={tile.romId}
      data-focus-label={tile.sortTitle ?? tile.title}
      {...props}
    >
      <div style={{ position: 'relative' }}>
        {landscape ? (
          <SceneArt tile={tile} />
        ) : (
          <CoverArt path={tile.coverPath} name={tile.title} />
        )}
        {installed ? (
          // A label rather than a `title`, which only a pointer ever sees. The
          // rest of the interface says this in a word — see `StatusBadge` — for
          // the reason `status.tsx` gives: a colour alone is easy to miss on a
          // television, and on a card there is no room for the word.
          <span className="card__installed" aria-label={t('library.downloadedMark')} />
        ) : null}
        {/* Said on the tile rather than left to the game's page: a grouped grid
            is one cover where there were three, and without this the two that
            went are simply missing. */}
        {tile.group ? (
          <span className="card__versions">
            {t('library.versions', { count: tile.group.length })}
          </span>
        ) : null}
      </div>
      <div className="card__title">{tile.title}</div>
      {showPlatform ? (
        <div className="card__meta">
          <PlatformIcon
            slug={tile.platformSlug}
            system={tile.system}
            size={26}
            label={tile.platformName}
          />
          <span>{tile.platformName}</span>
        </div>
      ) : null}
    </button>
  )
}

/**
 * A horizontally scrolling shelf of games.
 *
 * `onEndReached` makes the shelf endless. The sentinel is observed against the
 * row itself rather than the viewport, because this scroller moves sideways
 * independently of the page — and the margin is horizontal so the next batch
 * is requested while the end of the shelf is still off to the right.
 *
 * A focus group, keyed by the shelf's own title: walking onto a shelf from the
 * hero arrives at its first card, or at the card last left on it, rather than
 * at whichever one happens to sit under the column the press came down. From
 * one shelf to the next the geometry decides, so Down lands on the tile drawn
 * below the highlight. See `FocusGroup`.
 */
export function GameRow({
  title,
  shelf,
  tiles,
  installedIds,
  onSelect,
  onEndReached,
  focusRomId,
  landscape = false,
  autoFocus = false,
  onHighlight
}: {
  title: string
  /** Which shelf this is, for `npm run test:app`. See CONTRIBUTING. */
  shelf?: string
  tiles: GameTile[]
  installedIds: Set<number>
  onSelect: (tile: GameTile) => void
  onEndReached?: () => void
  /** The card to take the highlight on arrival, by `GameTile.romId`. */
  focusRomId?: number
  landscape?: boolean
  autoFocus?: boolean
  onHighlight?: (tile: GameTile) => void
}): JSX.Element | null {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const row = rowRef.current
    const sentinel = sentinelRef.current
    if (!onEndReached || !row || !sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onEndReached()
      },
      { root: row, rootMargin: '0px 600px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // `tiles.length` is not read in the effect and is here on purpose: the
    // sentinel does not move when a page is appended, so without re-observing,
    // an intersection that is still true after the shelf grows never fires
    // again and the row stops paging.
  }, [onEndReached, tiles.length])

  // After the hooks: bailing earlier would call a different number of them.
  if (tiles.length === 0) return null

  return (
    <section data-shelf={shelf}>
      <h2 className="section-title">{title}</h2>
      <FocusGroup id={`shelf:${title}`}>
        <div className={`row ${landscape ? 'row--scenes' : ''}`} ref={rowRef}>
          {tiles.map((tile, index) => (
            <GameCard
              key={tile.romId}
              tile={tile}
              installed={tileInstalled(tile, installedIds)}
              onSelect={() => onSelect(tile)}
              showPlatform
              autoFocus={tile.romId === focusRomId || (autoFocus && index === 0)}
              landscape={landscape}
              onHighlight={() => onHighlight?.(tile)}
            />
          ))}
          {onEndReached ? (
            <div className="row__sentinel" ref={sentinelRef} aria-hidden="true" />
          ) : null}
        </div>
      </FocusGroup>
    </section>
  )
}

/** Screenshot first, cover fallback, with a small cover to identify the game. */
function SceneArt({ tile }: { tile: GameTile }): JSX.Element {
  const url = window.rommix.system.assetUrl(tile.screenshotPath ?? null)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  return (
    <div className="scene-art">
      {url && !failed ? (
        <img
          className="scene-art__shot"
          src={url}
          alt={tile.title}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="scene-art__fallback">
          <CoverArt path={tile.coverPath} name={tile.title} />
        </div>
      )}
      {url && !failed ? (
        <div className="scene-art__cover">
          <CoverArt path={tile.coverPath} name={tile.title} />
        </div>
      ) : null}
    </div>
  )
}
