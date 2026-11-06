import { useEffect, useState, type JSX } from 'react'
import { CollectionCard, type LibraryCollection } from '../../components/CollectionCard'
import { FocusButton } from '../../components'
import { FocusGroup } from '../../input/focus'
import { useApp, useI18n, type HomeView } from '../../state'

/** Existing bridge data only. No synthesized recommendations or date anniversaries. */
export function useHomeGroups(offline: boolean | null): {
  own: LibraryCollection[]
} {
  const [own, setOwn] = useState<LibraryCollection[]>([])
  useEffect(() => {
    let current = true
    setOwn([])
    if (offline === false) {
      void window.rommix.library
        .collections()
        .then((p) => {
          if (current) setOwn(p.filter((c) => c.rom_count > 0))
        })
        .catch(() => {})
    }
    return () => {
      current = false
    }
  }, [offline])
  return { own }
}

/** Mount only a short preview. The collection index owns searching the full set. */
export function CollectionShelf({
  title,
  collections,
  view
}: {
  title: string
  collections: LibraryCollection[]
  view?: HomeView
}): JSX.Element | null {
  const { t } = useI18n()
  const { navigate, revise } = useApp()
  if (!collections.length) return null
  return (
    <section data-shelf="collections">
      <div className="section-heading">
        <h2 className="section-title">
          {title} <small>{collections.length}</small>
        </h2>
        <FocusButton
          variant="ghost"
          actionLabel={t('home.seeAll')}
          onSelect={() =>
            navigate({ name: 'collections', view: { openMine: true, openDerived: false } })
          }
        >
          {t('home.seeAll')}
        </FocusButton>
      </div>
      <FocusGroup id="home-collections">
        <div className="row collection-row">
          {collections.slice(0, 12).map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              autoFocus={view?.collectionId === collection.id}
              onSelect={() => {
                revise({
                  name: 'home',
                  view: {
                    shelf: 'collections',
                    collectionId: collection.id
                  }
                })
                navigate({
                  name: 'collection',
                  collectionId: collection.id,
                  title: collection.name
                })
              }}
            />
          ))}
        </div>
      </FocusGroup>
    </section>
  )
}
