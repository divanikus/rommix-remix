import { BrowseChoices } from '../../components/BrowseChoices'
import { Fragment, useEffect, useState, useRef, type JSX } from 'react'
import { FocusButton, Hints, PageTitle, Spinner, TextField } from '../../components'
import { CollectionCard, type LibraryCollection } from '../../components/CollectionCard'
import { FocusZone, useAction, useFocusContext } from '../../input/focus'
import { useApp, useI18n, type CollectionsView } from '../../state'

export function CollectionsScreen({ view }: { view?: CollectionsView }): JSX.Element {
  const { t } = useI18n()
  const { navigate, revise } = useApp()
  const { setFocus, setInitialFocus, activate } = useFocusContext()
  const [own, setOwn] = useState<LibraryCollection[]>([])
  const [virtual, setVirtual] = useState<LibraryCollection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(view?.search ?? '')
  const [mode, setMode] = useState<'all' | 'mine' | 'virtual'>(
    view?.openMine === false ? 'virtual' : view?.openDerived === true ? 'all' : 'mine'
  )
  const entered = useRef(false)
  const moreTarget = useRef<number | string | undefined>(undefined)
  const [shown, setShown] = useState(view?.shown ?? 48)
  useEffect(() => {
    let current = true
    void Promise.allSettled([
      window.rommix.library.collections(),
      window.rommix.library.virtualCollections()
    ]).then(([mine, theirs]) => {
      if (!current) return
      if (mine.status === 'fulfilled') setOwn(mine.value)
      if (theirs.status === 'fulfilled') setVirtual(theirs.value)
      if (mine.status === 'rejected' || theirs.status === 'rejected')
        setError(
          (mine.status === 'rejected'
            ? mine.reason
            : theirs.status === 'rejected'
              ? theirs.reason
              : null
          )?.message ?? ''
        )
      setLoading(false)
    })
    return () => {
      current = false
    }
  }, [])
  useAction('search', () => {
    setFocus('collections-search')
    activate()
  })
  const matching = (items: LibraryCollection[]): LibraryCollection[] =>
    items
      .filter(
        (c) =>
          c.rom_count > 0 && c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  const groups = [
    { name: 'mine', title: t('collections.mine'), items: mode === 'virtual' ? [] : matching(own) },
    {
      name: 'virtual',
      title: t('collections.derived'),
      items: mode === 'mine' ? [] : matching(virtual)
    }
  ]
  const initialCollection =
    groups.flatMap((g) => g.items).find((c) => c.id === view?.collectionId) ??
    groups.flatMap((g) => g.items)[0]
  const initialId = initialCollection?.id
  useEffect(() => {
    if (loading || entered.current) return
    let cancelled = false
    // Restore after card registration/StrictMode repair, as for the game library.
    queueMicrotask(() => {
      if (cancelled || entered.current) return
      entered.current = true
      if (initialId !== undefined)
        setInitialFocus('collection-' + typeof initialId + '-' + initialId)
    })
    return () => {
      cancelled = true
    }
  }, [loading, initialId, setInitialFocus])
  useEffect(() => {
    if (moreTarget.current === undefined) return
    setFocus('collection-' + typeof moreTarget.current + '-' + moreTarget.current)
    moreTarget.current = undefined
  }, [shown, setFocus])
  const open = (collection: LibraryCollection): void => {
    revise({
      name: 'collections',
      view: {
        collectionId: collection.id,
        openMine: mode !== 'virtual',
        openDerived: mode !== 'mine',
        search,
        shown
      }
    })
    navigate({ name: 'collection', collectionId: collection.id, title: collection.name })
  }
  return (
    <div className="content collections-screen">
      <PageTitle>{t('nav.collections')}</PageTitle>
      <div className="library-toolbar" data-focus-down="collections-list">
        <TextField
          field="collections-search"
          focusId="collections-search"
          label={t('library.searchLabel')}
          placeholder={t('library.searchLabel')}
          value={search}
          onChange={(value) => {
            setSearch(value)
            setShown(48)
          }}
        />
        <div className="library-control" data-control="collection-kind">
          <span>{t('library.scopeLabel')}</span>
          <BrowseChoices
            value={mode}
            onChange={setMode}
            options={[
              { value: 'all', label: t('collections.all') },
              { value: 'mine', label: t('collections.mine') },
              { value: 'virtual', label: t('collections.derived') }
            ]}
          />
        </div>
      </div>
      {error ? <div className="notice notice--error">{error}</div> : null}
      {loading ? <Spinner /> : null}
      <FocusZone id="collections-list">
        <div className="collection-grid" data-focus-collection="grid">
          {groups.map((group) =>
            group.items.length ? (
              <Fragment key={group.name}>
                <h2 className="section-title collection-heading">
                  {group.title} <small>{group.items.length}</small>
                </h2>
                {group.items.slice(0, shown).map((collection) => (
                  <CollectionCard
                    key={`${typeof collection.id}:${collection.id}`}
                    collection={collection}
                    autoFocus={false}
                    onSelect={() => open(collection)}
                  />
                ))}
              </Fragment>
            ) : null
          )}
          {groups.some((g) => g.items.length > shown) ? (
            <FocusButton
              action="more-collections"
              onSelect={() => {
                moreTarget.current = groups.find((g) => g.items.length > shown)?.items[shown]?.id
                setShown((n) => n + 48)
              }}
            >
              {t('home.showMore')}
            </FocusButton>
          ) : null}
        </div>
      </FocusZone>
      {!loading && !groups.some((g) => g.items.length) && !error ? (
        <div className="empty">{t('collections.empty')}</div>
      ) : null}
      <Hints
        items={[
          { key: 'A', label: t('action.open') },
          { key: 'Y', label: t('action.search') },
          { key: 'B', label: t('action.back') }
        ]}
      />
    </div>
  )
}
