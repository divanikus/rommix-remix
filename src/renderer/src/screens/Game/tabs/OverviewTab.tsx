import type { JSX } from 'react'
import type { RommRom } from '@shared/types'
import { Summary } from '../GameHero'
import { GameMedia } from '../GameMedia'

export function OverviewTab({ rom }: { rom: RommRom }): JSX.Element {
  return (
    <div className="game-overview">
      {rom.summary ? <Summary text={rom.summary} /> : null}
      <GameMedia rom={rom} />
    </div>
  )
}
