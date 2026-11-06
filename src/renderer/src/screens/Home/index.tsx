import { gameBrowse } from '../../game-browse'
import { ContinueCard } from './ContinueCard'
import { HomeWidgets } from './HomeWidgets'
import { type JSX, useMemo, useState, useCallback } from 'react'
import type { RommRom, RomQuery } from '@shared/types'
import {
  ArtBackdrop,
  FocusButton,
  GameRow,
  Hints,
  Spinner,
  romToOpen,
  tileFromInstalled,
  tileFromRom,
  type GameTile
} from '../../components'
import { useAction } from '../../input/focus'
import { useHomeGroups, CollectionShelf } from './LibraryShelves'
import { useRomPages } from '../../paging'
import { useApp, useI18n, type HomeView } from '../../state'

/**
 * The landing screen: screenshot and cover shelves, collection previews and widgets,
 * mirroring how RomM's own home page groups a library.
 */

const SHELF_PAGE = 20

interface Shelf {
  items: RommRom[]
  loaded: boolean
  error: string | null
  loadMore: () => void
  /** Ask for the first page again. See the notice `HomeScreen` draws. */
  retry: () => void
}

/**
 * One shelf: a query paged on its own, so walking one to its end fetches for
 * that shelf and leaves the others where they are.
 *
 * `useRomPages` does the paging — the same paging the library grid does. What
 * a shelf adds is where the message goes and what being away from the server
 * means to a row of the server's own games.
 */
function useShelf(query: RomQuery, offline: boolean | null): Shelf {
  /**
   * The message this shelf is holding, if any.
   *
   * Kept here rather than in the core because Home draws one notice above all
   * three shelves and any of them can be the one that failed — see the notice
   * `HomeScreen` draws, and `useRomPages.onError`.
   */
  const [error, setError] = useState<string | null>(null)
  const { roms, settled, loadMore, reload } = useRomPages(query, {
    pageSize: SHELF_PAGE,
    // Null until the first connection answer: a shelf that asked then put a
    // fetch error over a screen that was about to narrow, and left it there
    // until the screen was navigated away from and back.
    enabled: offline === null ? null : !offline,
    // The games on a shelf are the server's, most of which are not on this
    // disk. See `useRomPages.forgetOnStandDown`.
    forgetOnStandDown: true,
    onError: setError
  })

  return { items: roms, loaded: settled, error, loadMore, retry: reload }
}

/** How many of the games on disk the shelf shows before Downloads takes over. */
const READY_TO_PLAY_SHELF = 30

export function HomeScreen({ view }: { view?: HomeView }): JSX.Element {
  const { t } = useI18n()
  const { installed, installedIds, navigate, revise, canGoBack, offline } = useApp()
  const groups = useHomeGroups(offline)
  const [activeArt, setActiveArt] = useState<GameTile | null>(null)
  const highlightArt = useCallback(
    (tile: GameTile) =>
      setActiveArt((previous) =>
        previous?.romId === tile.romId &&
        previous?.coverPath === tile.coverPath &&
        previous?.screenshotPath === tile.screenshotPath
          ? previous
          : tile
      ),
    []
  )

  /**
   * The games on this device, newest install first.
   *
   * Built from the download index rather than by filtering the shelves above:
   * those are three queries with their own paging, so a game on disk appeared
   * here only if it happened to be a favourite, recent or recently played —
   * which made the one shelf about *this machine* the least reliable on the
   * screen. Downloads has the complete list; this is the top of it.
   */
  const readyToPlay = useMemo(
    () =>
      [...installed]
        .sort((a, b) => b.installedAt.localeCompare(a.installedAt))
        .slice(0, READY_TO_PLAY_SHELF)
        .map(tileFromInstalled),
    [installed]
  )

  // Y is the search button everywhere it is offered, and the only search box is
  // the library's — so here it takes you there rather than doing nothing while
  // the hint bar claims otherwise.
  useAction('search', () => navigate({ name: 'library' }))

  /**
   * Three of the four shelves are queries, and one is the download index.
   *
   * Which is the whole of what happens to this screen away from the server: the
   * queries stand down and the shelf that was always about this machine is what
   * is left, with a line above it saying why. The alternative — a screen of its
   * own for the same games — was a different application appearing whenever the
   * network dropped.
   *
   * Two of the three are grouped, as the library's grid is: a shelf holds a
   * dozen tiles and three of them being the same game in three regions is most
   * of a shelf spent saying one thing. See `RomQuery.group_by_meta_id`.
   *
   * Not this one. What it offers is the session to carry on with, and that
   * belongs to the dump that was played — the save is filed under that ROM, and
   * grouping would sooner or later hand somebody the copy the server picked
   * instead. Two versions of a game played here are two things to carry on
   * with, and this is the shelf that should say so.
   */
  const continuePlaying = useShelf(
    { last_played: true, order_by: 'last_played', order_dir: 'desc' },
    offline
  )
  const favourites = useShelf({ favorite: true, group_by_meta_id: true }, offline)
  const recentlyAdded = useShelf(
    { order_by: 'created_at', order_dir: 'desc', group_by_meta_id: true },
    offline
  )

  const error = continuePlaying.error ?? favourites.error ?? recentlyAdded.error
  const ready = continuePlaying.loaded && favourites.loaded && recentlyAdded.loaded

  if (!ready) {
    return (
      <div className="content">
        <Spinner />
      </div>
    )
  }

  const open = (shelf: string, tile: GameTile, discoveryOffset?: number): void => {
    revise({ name: 'home', view: { shelf, romId: tile.romId, discoveryOffset } })
    const tiles =
      shelf === 'ready'
        ? readyToPlay
        : shelf === 'continue'
          ? continuePlaying.items.map((rom) => tileFromRom(rom))
          : shelf === 'favourites'
            ? favourites.items.map((rom) => tileFromRom(rom, true))
            : shelf === 'recent'
              ? recentlyAdded.items.map((rom) => tileFromRom(rom, true))
              : [tile]
    navigate({
      name: 'game',
      romId: romToOpen(tile, installedIds),
      browse: gameBrowse(tiles, tile.romId, installedIds)
    })
  }
  /**
   * The card on `shelf` that a return lands on, if any.
   *
   * Restore only the recorded card; fresh visits start on the first game shelf.
   */
  const focusOn = (shelf: string): number | undefined =>
    view?.shelf === shelf ? view.romId : undefined

  return (
    <div className="content home-screen">
      <div className="home-ambience">
        <ArtBackdrop
          paths={[
            activeArt?.screenshotPath,
            activeArt?.coverPath,
            continuePlaying.items[0]?.merged_screenshots?.[0]
          ]}
        />
      </div>
      {offline ? <div className="notice notice--warn">{t('app.offlineNotice')}</div> : null}

      {/* Above the shelves rather than instead of them: "Ready to play" is
          built from the download index and works with no server at all, so
          one shelf's query failing must not take it down. The button is there
          because nothing else retries — navigating to a section only replaces
          the history entry, so this screen never remounts and the fetch never
          runs again. */}
      {error ? (
        <div className="notice notice--error">
          <span>{error}</span>
          <FocusButton
            icon="refresh"
            onSelect={() => {
              continuePlaying.retry()
              favourites.retry()
              recentlyAdded.retry()
            }}
          >
            {t('action.tryAgain')}
          </FocusButton>
        </div>
      ) : null}

      <div className="home-featured">
        {continuePlaying.items[0] ? (
          <ContinueCard
            key={continuePlaying.items[0].id}
            rom={continuePlaying.items[0]}
            autoFocus={!view || view.shelf === 'hero'}
            onSelect={() => open('hero', tileFromRom(continuePlaying.items[0]))}
          />
        ) : null}
        <HomeWidgets open={open} view={view} />
      </div>

      <GameRow
        title={t('home.continuePlaying')}
        shelf="continue"
        landscape
        autoFocus={false}
        tiles={continuePlaying.items.map((rom) => tileFromRom(rom))}
        installedIds={installedIds}
        onHighlight={highlightArt}
        onSelect={(tile) => open('continue', tile)}
        focusRomId={focusOn('continue')}
        onEndReached={continuePlaying.loadMore}
      />
      {/* No onEndReached: this shelf is the download index, which is already
          here in full, rather than a query that pages. */}
      <GameRow
        title={t('home.readyToPlay')}
        shelf="ready"
        autoFocus={!view && !continuePlaying.items.length}
        tiles={readyToPlay}
        installedIds={installedIds}
        onHighlight={highlightArt}
        onSelect={(tile) => open('ready', tile)}
        focusRomId={focusOn('ready')}
      />
      <GameRow
        title={t('home.favourites')}
        shelf="favourites"
        tiles={favourites.items.map((rom) => tileFromRom(rom, true))}
        installedIds={installedIds}
        onHighlight={highlightArt}
        onSelect={(tile) => open('favourites', tile)}
        focusRomId={focusOn('favourites')}
        onEndReached={favourites.loadMore}
      />
      <GameRow
        title={t('home.recentlyAdded')}
        shelf="recent"
        tiles={recentlyAdded.items.map((rom) => tileFromRom(rom, true))}
        installedIds={installedIds}
        onHighlight={highlightArt}
        onSelect={(tile) => open('recent', tile)}
        focusRomId={focusOn('recent')}
        onEndReached={recentlyAdded.loadMore}
      />

      <CollectionShelf title={t('collections.mine')} collections={groups.own} view={view} />

      {continuePlaying.items.length === 0 &&
      recentlyAdded.items.length === 0 &&
      favourites.items.length === 0 &&
      readyToPlay.length === 0 ? (
        <div className="empty">{offline ? t('home.emptyOffline') : t('home.empty')}</div>
      ) : null}

      <Hints
        items={[
          { key: 'A', label: t('action.open') },
          { key: 'Y', label: t('action.search') },
          // Nothing behind this screen means B is the way up rather than back:
          // to the menu, and from there out of RomMix. See `App`.
          { key: 'B', label: canGoBack ? t('action.back') : t('action.menu') }
        ]}
      />
    </div>
  )
}
