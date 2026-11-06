import type { RomQuery } from '@shared/types'
import { romToOpen, type GameTile } from './components/tiles'

/** An ephemeral snapshot of the ordered, filtered view that opened the card. */
export interface GameBrowse {
  items: { id: number; openId: number; title: string }[]
  index: number
  query?: RomQuery
  offset: number
  more: boolean
}

export function gameBrowse(
  tiles: readonly GameTile[],
  selected: number,
  installed: Set<number>,
  query?: RomQuery,
  more = false
): GameBrowse {
  return {
    items: tiles.map((tile) => ({
      id: tile.romId,
      openId: romToOpen(tile, installed),
      title: tile.title
    })),
    index: Math.max(
      0,
      tiles.findIndex((tile) => tile.romId === selected)
    ),
    query,
    offset: tiles.length,
    more
  }
}
