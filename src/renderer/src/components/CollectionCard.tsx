import type { JSX, Ref } from 'react'
import type { RommCollection, RommVirtualCollection } from '@shared/types'
import { CoverMosaic } from './art'
import { useFocusable } from '../input/focus'
import { useI18n } from '../state'

export type LibraryCollection = RommCollection | RommVirtualCollection

export function CollectionCard({
  collection,
  onSelect,
  autoFocus = false
}: {
  collection: LibraryCollection
  onSelect: () => void
  autoFocus?: boolean
}): JSX.Element {
  const { t } = useI18n()
  const { ref, props } = useFocusable({
    id: `collection-${typeof collection.id}-${collection.id}`,
    onSelect,
    autoFocus,
    actionLabel: t('action.open')
  })
  const cover = collection.path_cover_large ?? collection.path_cover_small
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      {...props}
      className="card collection-card"
      data-collection={collection.id}
      data-focus-label={collection.name}
    >
      <CoverMosaic paths={cover ? [cover] : collection.path_covers_small} name={collection.name} />
      <div className="card__title">{collection.name}</div>
      <div className="card__meta">{t('library.count', { count: collection.rom_count })}</div>
    </button>
  )
}
