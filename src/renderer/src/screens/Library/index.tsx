import { LibraryRow } from './LibraryRow'
import { filterCount, type LibraryFilters } from '@shared/library-filters'
import { LibraryFilterDialog, LibraryFilterButton } from '../../components/LibraryFilters'
import { BrowseChoices } from '../../components/BrowseChoices'
import { Fragment, useEffect, useCallback, useMemo, useRef, useState, type JSX } from 'react'
import { resolveSystem } from '@config/systems'
import type { RommPlatform, RomQuery } from '@shared/types'
import {
  GameCard,
  FocusButton,
  Hints,
  PageTitle,
  Spinner,
  TextField,
  romToOpen,
  tileFromInstalled,
  tileFromRom,
  tileInstalled,
  titleOf,
  type GameTile
} from '../../components'
import { FocusZone, useAction, useFocusContext } from '../../input/focus'
import { gameBrowse } from '../../game-browse'
import { PAGE_SIZE, usePagedRoms } from '../../paging'
import { useApp, useI18n, type LibraryView } from '../../state'
import {
  readPresentation,
  writePresentation,
  type CoverSize,
  type LibraryLayout
} from '../../library-presentation'
import { LetterGlimpse } from '../../components/LetterGlimpse'
import { titleLetter } from '../../library-letter'
import { Icon } from '../../icons'

import { useLetterJump } from '../../use-letter-jump'
import { PlatformCarousel, PLATFORM_ANCHOR } from '../../components/PlatformCarousel'
import { createLibraryPageCache } from '../../library-page-cache'

const SEARCH_FIELD = 'library-search'
type Scope = LibraryView['scope']
interface CollectionSource {
  id: number | string
  title: string
}
type Browse = Pick<LibraryView, 'search' | 'scope' | 'layout' | 'filters'> & {
  sortDir: 'asc' | 'desc'
}
function platformQuery(
  platformId: number | undefined,
  search: string,
  sortDir: 'asc' | 'desc',
  collectionId?: number | string,
  filters?: LibraryFilters
): RomQuery {
  return {
    ...(typeof collectionId === 'number'
      ? { collection_id: collectionId }
      : typeof collectionId === 'string'
        ? { virtual_collection_id: collectionId }
        : {}),
    filters: filterCount(filters) ? filters : undefined,
    search_term: search.trim() || undefined,
    platform_ids: platformId !== undefined ? [platformId] : undefined,
    group_by_meta_id: true,
    order_by: 'name',
    order_dir: sortDir
  }
}

/** One query and selection shared by the grid and the full-width table. */
export function LibraryScreen({
  view,
  collection
}: {
  view?: LibraryView
  collection?: CollectionSource
}): JSX.Element {
  const { offline, installed, settings, revise } = useApp()
  const { setFocus } = useFocusContext()
  const [cache] = useState(() =>
    createLibraryPageCache((query) => window.rommix.library.roms(query), PAGE_SIZE)
  )
  const [browse, setBrowse] = useState<Browse>(() => ({
    filters: view?.filters,
    scope: view?.scope ?? 'all',
    search: view?.search ?? '',
    layout: view?.layout ?? readPresentation(localStorage).layout,
    sortDir: readPresentation(localStorage).sortDir
  }))
  const [fromCarousel, setFromCarousel] = useState(false)
  const reportBrowse = useCallback((next: Browse) => setBrowse(next), [])
  const [platforms, setPlatforms] = useState<RommPlatform[]>([])
  const [platformError, setPlatformError] = useState<string | null>(null)
  useEffect(() => {
    if (offline === null || collection) return
    let current = true
    void window.rommix.library
      .platforms()
      .then((items) => {
        if (current) {
          setPlatforms(items)
          setPlatformError(null)
        }
      })
      .catch((cause: Error) => {
        if (current) setPlatformError(cause.message)
      })
    return () => {
      current = false
    }
  }, [offline, collection])
  const siblings = useMemo(
    () =>
      platforms
        .filter((platform) => {
          if (!offline) return platform.rom_count > 0
          const system = resolveSystem(platform.slug, platform.fs_slug, settings?.systemOverrides)
          return !!system && installed.some((entry) => entry.system === system)
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [platforms, offline, installed, settings?.systemOverrides]
  )
  const canCycle = view?.platformId !== undefined && siblings.length > 1
  const cycle = (delta: -1 | 1): void => {
    const index = siblings.findIndex((p) => p.id === view?.platformId)
    if (index < 0 || !canCycle) return
    // Park before React unregisters any games/toolbar controls. This node survives.
    setFocus(PLATFORM_ANCHOR)
    setFromCarousel(true)
    revise({
      name: 'library',
      view: {
        platformId: siblings[(index + delta + siblings.length) % siblings.length].id,
        filters: browse.filters,
        scope: browse.scope,
        search: browse.search,
        layout: browse.layout
      }
    })
  }
  useEffect(() => {
    if (offline !== false || browse.scope !== 'all') {
      cache.clear()
      return
    }
    const index = siblings.findIndex((p) => p.id === view?.platformId)
    if (index < 0 || siblings.length < 2) return
    // Warm only adjacent first-page metadata, never covers or game downloads.
    const timer = setTimeout(() => {
      for (const delta of [-1, 1]) {
        const platform = siblings[(index + delta + siblings.length) % siblings.length]
        void cache
          .read({
            ...platformQuery(platform.id, browse.search, browse.sortDir, undefined, browse.filters),
            limit: PAGE_SIZE,
            offset: 0
          })
          .catch(() => undefined)
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [
    cache,
    siblings,
    view?.platformId,
    browse.scope,
    browse.search,
    browse.sortDir,
    browse.filters,
    offline
  ])
  return (
    <div className="library-shell">
      {view?.platformId !== undefined ? (
        <PlatformCarousel platforms={siblings} selected={view.platformId} onStep={cycle} />
      ) : null}
      <LibraryContent
        key={collection ? `${typeof collection.id}:${collection.id}` : (view?.platformId ?? 'all')}
        collection={collection}
        view={view}
        platforms={platforms}
        platformError={platformError}
        cache={cache}
        onBrowse={reportBrowse}
        onCycle={cycle}
        canCycle={canCycle}
        fromCarousel={fromCarousel}
      />
    </div>
  )
}

function LibraryContent({
  view,
  platforms,
  platformError,
  cache,
  onBrowse,
  onCycle,
  canCycle,
  fromCarousel,
  collection
}: {
  view?: LibraryView
  platforms: RommPlatform[]
  platformError: string | null
  cache: ReturnType<typeof createLibraryPageCache>
  onBrowse: (view: Browse) => void
  onCycle: (delta: -1 | 1) => void
  canCycle: boolean
  fromCarousel: boolean
  collection?: CollectionSource
}): JSX.Element {
  const { t } = useI18n()
  const { installed, installedIds, navigate, offline, revise, settings } = useApp()
  const { setFocus, setInitialFocus, activate, enterZone, subscribeMove, getFocusedElement } =
    useFocusContext()
  // Arrival belongs to the route, not to each card mounted by a view/filter change.
  const arrival = useRef(!view?.focusSearch)
  const [presentation, setPresentation] = useState(() => ({
    ...readPresentation(localStorage),
    ...(view?.layout ? { layout: view.layout } : {})
  }))
  const [filters, setFilters] = useState<LibraryFilters>(view?.filters ?? {})
  const [filterOpen, setFilterOpen] = useState(false)
  const activeFilters = filterCount(filters)
  const [chosenScope, setScope] = useState<Scope>(view?.scope ?? 'all')
  const scope = offline ? 'downloaded' : chosenScope
  const selectedPlatform = view?.platformId
  const isSearch = !collection && selectedPlatform === undefined
  const [search, setSearch] = useState(view?.search ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const searchReady =
    !isSearch ||
    (scope === 'all' && activeFilters > 0) ||
    (search.trim().length >= 2 && debouncedSearch.trim().length >= 2)
  const [selected, setSelected] = useState(view?.romId)
  const [version, setVersion] = useState(view?.versionId)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<Set<number> | null>(null)
  const collectionId = collection?.id
  useEffect(() => {
    let current = true
    setMembers(null)
    if (collectionId !== undefined && scope === 'downloaded') {
      const request =
        typeof collectionId === 'string'
          ? window.rommix.library.virtualCollections()
          : window.rommix.library.collections()
      void request
        .then((items) => {
          if (current) setMembers(new Set(items.find((c) => c.id === collectionId)?.rom_ids ?? []))
        })
        .catch((cause: Error) => {
          if (current) setError(cause.message)
        })
    }
    return () => {
      current = false
    }
  }, [collectionId, scope])
  const query = platformQuery(
    selectedPlatform,
    debouncedSearch,
    presentation.sortDir,
    collection?.id,
    scope === 'all' ? filters : undefined
  )
  const { roms, total, more, loading, sentinel, loadMore, retry } = usePagedRoms(query, {
    enabled: offline === false && scope === 'all' && searchReady,
    initialCount: view?.held,
    onError: setError,
    initialPage: cache.peek({ ...query, offset: 0, limit: Math.max(PAGE_SIZE, view?.held ?? 0) }),
    fetchPage: cache.read
  })
  useEffect(
    () =>
      onBrowse({
        filters,
        scope: chosenScope,
        search,
        layout: presentation.layout,
        sortDir: presentation.sortDir
      }),
    [onBrowse, chosenScope, search, presentation.layout, presentation.sortDir, filters]
  )
  useEffect(() => {
    writePresentation(localStorage, presentation)
    document.documentElement.dataset.coverSize = presentation.coverSize
  }, [presentation])
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 350)
    return () => window.clearTimeout(timer)
  }, [search])
  useEffect(() => {
    if (view?.focusSearch) {
      setFocus(SEARCH_FIELD)
      activate()
    }
  }, [view?.focusSearch, setFocus, activate])
  useAction('search', () => {
    setFocus(SEARCH_FIELD)
    activate()
  })

  const chosen = platforms.find((p) => p.id === selectedPlatform)
  const downloaded = useMemo(() => {
    if (scope !== 'downloaded' || (collection && !members)) return []
    const system = chosen
      ? resolveSystem(chosen.slug, chosen.fs_slug, settings?.systemOverrides)
      : null
    // An unresolved selected platform must never show all local games.
    if (selectedPlatform !== undefined && !system) return []
    const term = search.trim().toLowerCase()
    return installed
      .filter((entry) => !system || entry.system === system)
      .filter((entry) => !collection || members?.has(entry.romId))
      .filter((entry) => !term || titleOf(entry).toLowerCase().includes(term))
      .sort(
        (a, b) => titleOf(a).localeCompare(titleOf(b)) * (presentation.sortDir === 'desc' ? -1 : 1)
      )
  }, [
    scope,
    chosen,
    selectedPlatform,
    search,
    installed,
    settings?.systemOverrides,
    presentation.sortDir,
    collection,
    members
  ])
  const tiles = useMemo(
    () =>
      !searchReady
        ? []
        : scope === 'downloaded'
          ? downloaded.map(tileFromInstalled)
          : roms.map((rom) => tileFromRom(rom, true)),
    [scope, downloaded, roms, searchReady]
  )
  const rowMetadata = useMemo(() => new Map(roms.map((rom) => [rom.id, rom])), [roms])
  const localSizes = useMemo(
    () => new Map(installed.map((entry) => [entry.romId, entry.sizeBytes])),
    [installed]
  )
  useEffect(
    () =>
      subscribeMove(() => {
        arrival.current = false
      }),
    [subscribeMove]
  )
  useEffect(() => {
    if (!arrival.current || !tiles.length) return
    let cancelled = false
    // Wait for new cards' registration effects, including StrictMode replay.
    // Their transient first-item repair must not replace route restoration.
    queueMicrotask(() => {
      if (cancelled || !arrival.current) return
      if (fromCarousel && getFocusedElement()?.dataset.platformSlot !== 'current') {
        arrival.current = false
        return
      }
      arrival.current = false
      const target = tiles.find((tile) => tile.romId === view?.romId) ?? tiles[0]
      setSelected(target.romId)
      if (view?.romId !== target.romId) setVersion(undefined)
      setInitialFocus(`library-game-${target.romId}`)
    })
    return () => {
      cancelled = true
    }
  }, [tiles, view?.romId, setInitialFocus, fromCarousel, getFocusedElement])
  useEffect(() => {
    if (scope !== 'all' || !more || loading || error) return
    const index = tiles.findIndex((tile) => tile.romId === selected)
    // Keep one page of metadata ahead of focus, rather than wait until the last
    // row meets a pixel sentinel. Covers/ROMs are not downloaded by this request.
    if (index >= 0 && tiles.length - index <= PAGE_SIZE) loadMore()
  }, [scope, more, loading, error, tiles, selected, loadMore])
  const {
    flash,
    pending,
    cancel: cancelJump
  } = useLetterJump({
    tiles,
    selected,
    more: scope === 'all' && more,
    loading,
    error,
    loadMore
  })
  useAction('header', () => {
    arrival.current = false
    cancelJump()
    if (!enterZone(selectedPlatform !== undefined ? 'library-platforms' : 'nav'))
      enterZone('library-list')
  })
  const cycle = (delta: -1 | 1): boolean => {
    if (!canCycle) return false
    cancelJump()
    onCycle(delta)
    return true
  }
  useAction('tabLeft', () => cycle(-1))
  useAction('tabRight', () => cycle(1))
  const current = tiles.find((tile) => tile.romId === selected) ?? tiles[0]
  const count = scope === 'downloaded' ? tiles.length : (total ?? roms.length)
  const busy =
    (loading && scope === 'all') ||
    offline === null ||
    (!!collection && scope === 'downloaded' && !members && !error)
  const resetSelection = (): void => {
    arrival.current = false
    cancelJump()
    setSelected(undefined)
    setVersion(undefined)
  }
  const highlight = (tile: GameTile): void => {
    if (arrival.current) return
    if (tile.romId !== selected) {
      setSelected(tile.romId)
      setVersion(undefined)
    }
  }
  const open = (tile: GameTile): void => {
    const romId =
      tile.romId === selected && version !== undefined ? version : romToOpen(tile, installedIds)
    revise({
      ...(collection
        ? { name: 'collection' as const, collectionId: collection.id, title: collection.title }
        : { name: 'library' as const }),
      view: {
        filters,
        scope: chosenScope,
        search,
        platformId: selectedPlatform,
        romId: tile.romId,
        versionId: romId,
        held: tiles.length,
        layout: presentation.layout
      }
    })
    const browse = gameBrowse(
      tiles,
      tile.romId,
      installedIds,
      scope === 'all' ? query : undefined,
      scope === 'all' && more
    )
    browse.items[browse.index].openId = romId
    navigate({ name: 'game', romId, browse })
  }
  return (
    <div
      className="content library-screen"
      data-layout={presentation.layout}
      data-selected-rom={current?.romId}
    >
      <div className="library-heading" title={collection?.title}>
        {selectedPlatform === undefined ? (
          <PageTitle>
            {collection?.title ?? t(isSearch ? 'action.search' : 'library.title')}
          </PageTitle>
        ) : null}
        {searchReady ? <p className="page-subtitle">{t('library.count', { count })}</p> : null}
      </div>
      {offline ? <div className="notice notice--warn">{t('app.offlineNotice')}</div> : null}
      <div className="library-toolbar" data-focus-down="library-list">
        <TextField
          focusId={SEARCH_FIELD}
          field="library-search"
          label={t('library.searchLabel')}
          value={search}
          onChange={(value) => {
            resetSelection()
            setSearch(value)
          }}
          placeholder={t('library.searchPlaceholder')}
        />
        {scope === 'all' && offline === false ? (
          <LibraryFilterButton
            count={activeFilters}
            onSelect={() => {
              arrival.current = false
              cancelJump()
              setFilterOpen(true)
            }}
          />
        ) : null}
        {searchReady ? (
          <>
            {!offline ? (
              <div className="library-control">
                <span>{t('library.scopeLabel')}</span>
                <BrowseChoices<Scope>
                  value={scope}
                  onChange={(value) => {
                    resetSelection()
                    setScope(value)
                  }}
                  options={[
                    { value: 'all', label: t('library.scopeAll') },
                    { value: 'downloaded', label: t('library.scopeDownloaded') }
                  ]}
                />
              </div>
            ) : null}
            <div className="library-control" data-control="grouping">
              <span>{t('library.grouping')}</span>
              <BrowseChoices
                value={presentation.groupBy}
                onChange={(groupBy: 'none' | 'letter') => {
                  arrival.current = false
                  cancelJump()
                  setPresentation((p) => ({ ...p, groupBy }))
                }}
                options={[
                  { value: 'none', label: t('library.ungrouped') },
                  { value: 'letter', label: 'ABC' }
                ]}
              />
            </div>
            <div className="library-control" data-control="sort">
              <span>{t('library.order')}</span>
              <BrowseChoices
                value={presentation.sortDir}
                onChange={(sortDir: 'asc' | 'desc') => {
                  resetSelection()
                  setPresentation((p) => ({ ...p, sortDir }))
                }}
                options={[
                  { value: 'asc', label: 'A–Z' },
                  { value: 'desc', label: 'Z–A' }
                ]}
              />
            </div>
            <div className="library-control" data-control="layout">
              <span>{t('library.view')}</span>
              <BrowseChoices<LibraryLayout>
                value={presentation.layout}
                onChange={(layout) => {
                  arrival.current = false
                  cancelJump()
                  setPresentation((p) => ({ ...p, layout }))
                }}
                options={[
                  {
                    value: 'grid',
                    label: t('library.grid'),
                    mark: <Icon name="library" size={19} />
                  },
                  { value: 'list', label: t('library.list'), mark: <Icon name="sort" size={19} /> }
                ]}
              />
            </div>
            {presentation.layout === 'grid' ? (
              <div className="library-control" data-control="cover-size">
                <span>{t('library.coverSize')}</span>
                <BrowseChoices<CoverSize>
                  value={presentation.coverSize}
                  onChange={(coverSize) => {
                    arrival.current = false
                    cancelJump()
                    setPresentation((p) => ({ ...p, coverSize }))
                  }}
                  options={[
                    { value: 'small', label: t('library.small') },
                    { value: 'medium', label: t('library.medium') },
                    { value: 'large', label: t('library.large') }
                  ]}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      {!searchReady ? <div className="search-prompt">{t('library.searchPrompt')}</div> : null}
      {error ? (
        <div className="notice notice--error" role="alert">
          {error}
          {scope === 'all' && offline === false ? (
            <FocusButton action="retry-library" icon="refresh" onSelect={retry}>
              {t('action.retry')}
            </FocusButton>
          ) : null}
        </div>
      ) : null}
      {activeFilters > 0 ? (
        <div className="library-filter-summary" data-filter-summary>
          {scope === 'downloaded' ? (
            t('filters.paused')
          ) : (
            <>
              <span>{t('filters.active')}</span>
              {Object.entries(filters.facets ?? {})
                .filter(([, v]) => v.values.length)
                .map(([key, v]) => (
                  <span key={key}>
                    {t(`filters.${key}` as Parameters<typeof t>[0])}: {t(`filters.${v.logic}`)} ·{' '}
                    {v.values.join(', ')}
                  </span>
                ))}
              {Object.entries(filters.flags ?? {}).map(([key, v]) => (
                <span key={key}>
                  {t(`filters.${key}` as Parameters<typeof t>[0])}:{' '}
                  {t(v ? 'filters.yes' : 'filters.no')}
                </span>
              ))}
              {filters.duration ? (
                <span>
                  HowLongToBeat:{' '}
                  {t('filters.hoursRange', {
                    min: filters.duration.minHours ?? t('filters.anyValue'),
                    max: filters.duration.maxHours ?? t('filters.anyValue')
                  })}
                </span>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {platformError ? <div className="notice notice--error">{platformError}</div> : null}
      {searchReady ? (
        <div className="library-layout">
          <FocusZone id="library-list">
            <div
              className={presentation.layout === 'grid' ? 'grid library-grid' : 'library-rows'}
              data-focus-collection={presentation.layout}
            >
              {presentation.layout === 'list' && tiles.length > 0 ? (
                <div className="library-table-header" aria-hidden="true">
                  <span>
                    {t('library.columnGame')} {presentation.sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                  <span data-column="size">{t('library.columnSize')}</span>
                  <span data-column="added">{t('library.columnAdded')}</span>
                  <span data-column="released">{t('details.released')}</span>
                  <span data-column="rating">{t('library.columnRating')}</span>
                  <span data-column="duration">{t('details.toBeat')}</span>
                  <span data-column="languages">{t('details.languages')}</span>
                  <span data-column="regions">{t('details.regions')}</span>
                </div>
              ) : null}
              {tiles.map((tile, index) => (
                <Fragment key={tile.romId}>
                  {presentation.groupBy === 'letter' &&
                  (index === 0 ||
                    titleLetter(tiles[index - 1].sortTitle ?? tiles[index - 1].title) !==
                      titleLetter(tile.sortTitle ?? tile.title)) ? (
                    <h2 className="library-letter-heading">
                      {titleLetter(tile.sortTitle ?? tile.title)}
                    </h2>
                  ) : null}
                  {presentation.layout === 'grid' ? (
                    <GameCard
                      key={tile.romId}
                      tile={tile}
                      focusId={`library-game-${tile.romId}`}
                      installed={tileInstalled(tile, installedIds)}
                      onSelect={() => open(tile)}
                      onHighlight={() => highlight(tile)}
                      showPlatform={selectedPlatform === undefined}
                    />
                  ) : (
                    <LibraryRow
                      key={tile.romId}
                      tile={tile}
                      installed={tileInstalled(tile, installedIds)}
                      rom={scope === 'all' ? rowMetadata.get(tile.romId) : undefined}
                      localBytes={scope === 'downloaded' ? localSizes.get(tile.romId) : undefined}
                      selected={current?.romId === tile.romId}
                      onHighlight={() => highlight(tile)}
                      onSelect={() => open(tile)}
                    />
                  )}
                </Fragment>
              ))}
              <div ref={sentinel} className="library-sentinel" aria-hidden="true" />
              {busy && !tiles.length ? (
                <div className="library-loading" role="status">
                  <Spinner />
                </div>
              ) : busy ? (
                <Spinner />
              ) : null}
              {!busy && !tiles.length && !error ? (
                <div className="empty">
                  {t(
                    scope === 'downloaded' && !search
                      ? 'library.noneDownloaded'
                      : 'library.noMatches'
                  )}
                </div>
              ) : null}
              {!busy && scope === 'all' && !!tiles.length && !more ? (
                <p className="library-end">{t('library.thatIsAll', { count })}</p>
              ) : null}
            </div>
          </FocusZone>
        </div>
      ) : null}
      {filterOpen ? (
        <LibraryFilterDialog
          value={filters}
          query={query}
          onClose={() => setFilterOpen(false)}
          onApply={(next) => {
            resetSelection()
            setError(null)
            setFilters(next)
            setFilterOpen(false)
          }}
        />
      ) : null}
      <LetterGlimpse flash={flash} />
      {pending ? (
        <div className="library-jump-status" role="status">
          {t('library.loadingLetter')}
        </div>
      ) : null}
      <Hints
        items={[
          {
            key: 'A',
            label: t('action.open')
          },
          { key: 'Y', label: t('action.search') },
          { key: 'SELECT', label: t('library.headerReturn') },
          ...(searchReady
            ? [
                { key: 'LT', label: t('library.previousLetter') },
                { key: 'RT', label: t('library.nextLetter') }
              ]
            : []),
          ...(canCycle
            ? [
                { key: 'LB', label: t('library.previousPlatform') },
                { key: 'RB', label: t('library.nextPlatform') }
              ]
            : []),
          { key: 'B', label: t('action.back') }
        ]}
      />
    </div>
  )
}
