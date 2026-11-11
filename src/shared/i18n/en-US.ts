import type { Catalog } from './catalog.ts'
import { en } from './en.ts'

/** US spelling; all other English wording stays shared. */
export const enUS: Catalog = {
  ...en,
  'settings.enrichEsdeHint':
    'Fill missing metadata for completed EmuDeck downloads. Existing descriptions, favorites and statistics stay unchanged. Close ES-DE to publish queued changes.',
  'filters.favorite': 'Favorite',
  'toast.downloadCancelled': 'Download canceled',
  'setup.interfaceSubtitle':
    'Its language, its colors and its size. All three can be changed later in Settings.',
  'home.favourites': 'Favorites',
  'game.addFavourite': 'Add to favorites',
  'game.removeFavourite': 'Remove from favorites',
  'game.favouriteAdded': 'Added to favorites on RomM',
  'game.favouriteRemoved': 'Removed from favorites',
  'settings.themeHint': 'The colors everything is drawn in.',
  'themes.noticeBody':
    'The interface can be drawn in other colors — a light theme, or one taken from a console. Each is shown on screen before you keep it.'
}
