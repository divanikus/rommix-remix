import type { JSX } from 'react'
import { SegmentedControl, type SegmentedOptions } from './controls'
import { Icon, type IconName } from '../icons'
const symbols: Record<string, IconName> = {
  grid: 'grid',
  list: 'list',
  none: 'group',
  asc: 'ascending',
  desc: 'descending',
  family: 'company',
  category: 'genre',
  generation: 'sort',
  local: 'device',
  count: 'roms'
}
/** One visual vocabulary for the same choices in systems, games and collections. */
export function BrowseChoices<T extends string>(props: {
  options: SegmentedOptions<T>
  value: T
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <SegmentedControl
      {...props}
      iconsOnly
      options={props.options.map((option) => ({
        ...option,
        mark: symbols[option.value] ? <Icon name={symbols[option.value]} size={18} /> : undefined
      }))}
    />
  )
}
