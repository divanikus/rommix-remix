import type { JSX, Ref } from 'react'
import { FocusZone, useAction, useFocusable, useFocusContext, useKeyLabel } from '../input/focus'
import { Icon } from '../icons'
import { useApp, useI18n, type Route } from '../state'
import { FocusButton } from './controls'

/** One order and icon set for the menu and the always-visible utility sections. */
export const UTILITY_ITEMS = [
  { name: 'settings', label: 'nav.settings', icon: 'settings' },
  { name: 'emulators', label: 'nav.emulators', icon: 'emulator' },
  { name: 'bios', label: 'nav.bios', icon: 'bios' },
  { name: 'downloads', label: 'nav.downloads', icon: 'downloads' }
] as const

export function UtilityNavigation({
  route,
  onBack,
  onMenu
}: {
  route: Route
  onBack: () => void
  onMenu: () => void
}): JSX.Element {
  const { t } = useI18n()
  const { navigate } = useApp()
  const { retainFocus } = useFocusContext()
  const keyLabel = useKeyLabel()
  const step = (delta: -1 | 1): void => {
    const index = UTILITY_ITEMS.findIndex((item) => item.name === route.name)
    const next = UTILITY_ITEMS[(index + delta + UTILITY_ITEMS.length) % UTILITY_ITEMS.length]
    retainFocus(`utility-${next.name}`)
    navigate({ name: next.name })
  }
  useAction('tabLeft', () => step(-1))
  useAction('tabRight', () => step(1))
  return (
    <FocusZone id="nav">
      <header className="utility-topbar app-header">
        <FocusButton icon="back" variant="ghost" action="utility-back" onSelect={onBack}>
          <span className="hint__key" aria-hidden="true">
            {keyLabel('B')}
          </span>
          <span className="utility-back-label">{t('action.back')}</span>
        </FocusButton>
        <nav className="topbar__nav utility-sections" aria-label={t('action.menu')}>
          <span className="nav-bumper hint__key" aria-hidden="true">
            {keyLabel('LB')}
          </span>
          {UTILITY_ITEMS.map((item) => (
            <UtilityItem
              key={item.name}
              item={item}
              active={route.name === item.name}
              onSelect={() => {
                retainFocus(`utility-${item.name}`)
                if (route.name !== item.name) navigate({ name: item.name })
              }}
            />
          ))}
          <span className="nav-bumper hint__key" aria-hidden="true">
            {keyLabel('RB')}
          </span>
        </nav>
        <FocusButton
          icon="user"
          variant="ghost"
          action="utility-menu"
          actionLabel={t('action.menu')}
          onSelect={onMenu}
        />
      </header>
    </FocusZone>
  )
}

function UtilityItem({
  item,
  active,
  onSelect
}: {
  item: (typeof UTILITY_ITEMS)[number]
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const { t } = useI18n()
  const { ref, props } = useFocusable({
    id: `utility-${item.name}`,
    onSelect,
    actionLabel: t(item.label)
  })
  return (
    <button
      {...props}
      ref={ref as Ref<HTMLButtonElement>}
      className="nav-item"
      data-utility-route={item.name}
      data-active={active}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name={item.icon} size={18} />
      <span className="nav-item__label">{t(item.label)}</span>
    </button>
  )
}
