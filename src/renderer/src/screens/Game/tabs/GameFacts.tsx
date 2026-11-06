import type { JSX } from 'react'
import type { RommRom } from '@shared/types'
import { useI18n } from '../../../state'

/** Merged server facts. Combined companies are never relabelled as developers. */
export function GameFacts({ rom, played }: { rom: RommRom; played: number | null }): JSX.Element {
  const { t, formatDuration, formatDate } = useI18n()
  const meta = rom.metadatum
  const facts: [string, string[]][] = [
    [
      t('details.players'),
      meta.player_count && meta.player_count !== '0' ? [meta.player_count] : []
    ],
    [t('details.genres'), meta.genres],
    [t('game.developers'), meta.developers ?? []],
    [t('game.publishers'), meta.publishers ?? []],
    [
      t('details.company'),
      meta.developers?.length || meta.publishers?.length ? [] : meta.companies
    ],
    [t('game.metadataCollections'), meta.collections ?? []],
    [t('details.series'), meta.franchises],
    [t('details.modes'), meta.game_modes],
    [t('game.ageRatings'), meta.age_ratings],
    [
      t('details.released'),
      meta.first_release_date ? [formatDate(meta.first_release_date) ?? ''] : []
    ],
    [t('details.played'), played ? [formatDuration(played) ?? ''] : []],
    [
      t('details.toBeat'),
      rom.hltb_metadata?.main_story ? [formatDuration(rom.hltb_metadata.main_story) ?? ''] : []
    ]
  ]
  return (
    <dl className="game-facts">
      {facts
        .filter(([, values]) => values?.length)
        .map(([label, values]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{values.join(', ')}</dd>
          </div>
        ))}
    </dl>
  )
}
