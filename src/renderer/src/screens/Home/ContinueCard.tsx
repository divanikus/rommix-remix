import { useEffect, useState, type JSX, type Ref } from 'react'
import type { RommRom } from '@shared/types'
import { CoverArt, PlatformIcon } from '../../components'
import { useFocusable } from '../../input/focus'
import { Icon } from '../../icons'
import { useI18n } from '../../state'
/** Exact last-played version; opening retains RomMix's launch/version checks. */
export function ContinueCard({
  rom,
  onSelect,
  autoFocus
}: {
  rom: RommRom
  onSelect: () => void
  autoFocus: boolean
}): JSX.Element {
  const { t, formatDuration } = useI18n()
  const [failed, setFailed] = useState(false)
  const [played, setPlayed] = useState<number | null>(null)
  useEffect(() => {
    let current = true
    setPlayed(null)
    setFailed(false)
    void window.rommix.library
      .playTime(rom.id)
      .then((total) => {
        if (current) setPlayed(total)
      })
      .catch(() => {
        /* Unavailable statistics do not become a fabricated zero. */
      })
    return () => {
      current = false
    }
  }, [rom.id])
  const duration = played && played > 0 ? formatDuration(played) : null
  const { ref, props } = useFocusable({
    id: 'continue-feature',
    onSelect,
    autoFocus,
    actionLabel: t('action.open')
  })
  const shot = window.rommix.system.assetUrl(rom.merged_screenshots?.[0] ?? null)
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      className="continue-card"
      data-featured-rom={rom.id}
      {...props}
    >
      {shot && !failed ? (
        <img className="continue-card__scene" src={shot} alt="" onError={() => setFailed(true)} />
      ) : null}
      <div className="continue-card__cover">
        <CoverArt
          path={rom.path_cover_large ?? rom.path_cover_small}
          name={rom.name ?? rom.fs_name}
        />
      </div>
      <div className="continue-card__body">
        <span className="continue-card__reason">{t('home.continuePlaying')}</span>
        <strong>{rom.name ?? rom.fs_name}</strong>
        <span className="continue-card__platform">
          <PlatformIcon slug={rom.platform_slug} size={22} label={rom.platform_display_name} />
          {rom.platform_display_name}
        </span>
        {rom.summary?.trim() ? <span className="continue-card__summary">{rom.summary}</span> : null}
        {duration ? (
          <span className="continue-card__played">
            <Icon name="time" size={16} />
            {t('details.played')}: {duration}
          </span>
        ) : null}
        <span className="continue-card__action">
          <Icon name="play" size={18} />
          {t('action.open')}
        </span>
      </div>
    </button>
  )
}
