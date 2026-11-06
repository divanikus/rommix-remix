import type { JSX } from 'react'
import type { CollectionView } from '../../state'
import { LibraryScreen } from '../Library'

/** Collection contents use the same grouped grid/list, sizes and version actions. */
export function CollectionScreen({
  collectionId,
  title,
  view
}: {
  collectionId: number | string
  title: string
  view?: CollectionView
}): JSX.Element {
  return <LibraryScreen view={view} collection={{ id: collectionId, title }} />
}
