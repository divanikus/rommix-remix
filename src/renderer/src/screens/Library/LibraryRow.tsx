import { useEffect, type JSX, type Ref } from 'react'
import type { RommRom } from '@shared/types'
import { CoverArt, type GameTile } from '../../components'
import { Icon } from '../../icons'
import { useFocusable, useFocusContext } from '../../input/focus'
import { useI18n } from '../../state'

export function LibraryRow({
  tile,
  installed,
  rom,
  localBytes,
  selected,
  onHighlight,
  onSelect
}: {
  tile: GameTile
  installed: boolean
  rom?: RommRom
  localBytes?: number
  selected: boolean
  onHighlight: () => void
  onSelect: () => void
}): JSX.Element {
  const { t, formatBytes, formatDate, formatDuration } = useI18n()
  const { isFocused } = useFocusContext()
  const focusId = `library-game-${tile.romId}`
  const { ref, props, focused } = useFocusable({
    id: focusId,
    onSelect,
    actionLabel: t('action.open')
  })
  useEffect(() => {
    // Registration may briefly repair focus before the selected row's autofocus
    // runs. Only the current focus may update selection after that commit.
    if (focused && isFocused(focusId)) onHighlight()
  }, [focused, focusId, isFocused, onHighlight])
  const released = rom?.metadatum.first_release_date
  const bytes = rom?.fs_size_bytes ?? localBytes
  const rating = rom?.metadatum.average_rating
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      className="library-row"
      data-rom={tile.romId}
      data-focus-label={tile.sortTitle ?? tile.title}
      data-selected={selected}
      aria-pressed={selected}
      {...props}
    >
      <span className="library-row__game">
        <CoverArt path={tile.coverPath} name={tile.title} />
        <span className="library-row__identity">
          <span className="library-row__title">
            <strong title={tile.title}>{tile.title}</strong>
            {tile.group ? (
              <span
                className="library-row__badge"
                title={t('library.versions', { count: tile.group.length })}
              >
                <Icon name="roms" size={14} />
                {tile.group.length}
              </span>
            ) : null}
          </span>
          {rom?.fs_name ? (
            <small className="library-row__filename" title={rom.fs_name}>
              {rom.fs_name}
            </small>
          ) : null}
          <small className="library-row__meta">
            {tile.platformName}
            {installed ? (
              <span className="library-row__badge">
                <Icon name="download" size={13} />
                {t('library.downloadedMark')}
              </span>
            ) : null}
          </small>
        </span>
      </span>
      <span data-column="size">{bytes === undefined ? '—' : formatBytes(bytes)}</span>
      <span data-column="added">{rom?.created_at ? (formatDate(rom.created_at) ?? '—') : '—'}</span>
      <span data-column="released">{released ? (formatDate(released) ?? '—') : '—'}</span>
      <span data-column="rating">
        {typeof rating === 'number' && rating > 0 ? rating.toFixed(1) : '—'}
      </span>
      <span data-column="duration">
        {formatDuration(rom?.hltb_metadata?.main_story ?? 0) ?? '—'}
      </span>
      <span data-column="languages">
        <TableTags values={rom?.languages ?? []} />
      </span>
      <span data-column="regions">
        <TableTags values={rom?.regions ?? []} />
      </span>
    </button>
  )
}

function TableTags({ values }: { values: string[] }): JSX.Element {
  return (
    <span className="library-row__tags" title={values.join(', ')}>
      {values.length
        ? values.slice(0, 2).map((value, index) => <span key={`${value}-${index}`}>{value}</span>)
        : '—'}
      {values.length > 2 ? <span>+{values.length - 2}</span> : null}
    </span>
  )
}
