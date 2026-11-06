import type { JSX, Ref } from 'react'
import type { RommPlatform } from '@shared/types'
import { FocusZone, useFocusable, useFocusContext, useKeyLabel } from '../input/focus'
import { useI18n } from '../state'
import { PlatformIcon } from './art'

export const PLATFORM_ANCHOR = 'library-platform-current'

/** Persistent slots: changing their labels never unregisters the focus anchor. */
export function PlatformCarousel({
  platforms,
  selected,
  onStep
}: {
  platforms: RommPlatform[]
  selected: number
  onStep: (delta: -1 | 1) => void
}): JSX.Element {
  const { t } = useI18n()
  const { enterZone } = useFocusContext()
  const keyLabel = useKeyLabel()
  const index = platforms.findIndex((p) => p.id === selected)
  // The route replaces the root bar before platform metadata arrives. Keep its
  // frame even while loading or on failure so the page below never moves up.
  if (index < 0)
    return (
      <nav
        className="platform-carousel app-header"
        aria-label={t('library.systems')}
        data-platform-pending="true"
      />
    )
  const canStep = platforms.length > 1
  const previous = platforms[(index - 1 + platforms.length) % platforms.length]
  const next = platforms[(index + 1) % platforms.length]
  return (
    <FocusZone id="library-platforms">
      <nav className="platform-carousel app-header" aria-label={t('library.systems')}>
        {canStep ? (
          <Slot
            position="previous"
            platform={previous}
            label={t('library.previousPlatform')}
            onSelect={() => onStep(-1)}
          >
            <span className="hint__key">{keyLabel('LB')}</span>
          </Slot>
        ) : (
          <span />
        )}
        <Slot
          position="current"
          platform={platforms[index]}
          label={t('action.open')}
          onSelect={() => enterZone('library-list')}
        />
        {canStep ? (
          <Slot
            position="next"
            platform={next}
            label={t('library.nextPlatform')}
            onSelect={() => onStep(1)}
          >
            <span className="hint__key">{keyLabel('RB')}</span>
          </Slot>
        ) : (
          <span />
        )}
      </nav>
    </FocusZone>
  )
}

function Slot({
  position,
  platform,
  label,
  children,
  onSelect
}: {
  position: 'previous' | 'current' | 'next'
  platform: RommPlatform
  label: string
  children?: JSX.Element
  onSelect: () => void
}): JSX.Element {
  const { ref, props } = useFocusable({
    id: `library-platform-${position}`,
    onSelect,
    actionLabel: label
  })
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      {...props}
      className={`platform-carousel__${position}`}
      data-platform-slot={position}
      data-platform={platform.id}
      aria-label={`${label}: ${platform.display_name}`}
    >
      {position === 'previous' ? children : null}
      <span className="platform-carousel__name" title={platform.display_name}>
        <span className="platform-carousel__identity">
          <span className="platform-carousel__icon" aria-hidden="true">
            <PlatformIcon key={platform.slug} slug={platform.slug} size={28} />
          </span>
          <span className="platform-carousel__text">{platform.display_name}</span>
        </span>
      </span>
      {position === 'next' ? children : null}
    </button>
  )
}
