import { useCallback, useEffect, useState, type JSX, type Ref } from 'react'
import { isInProgress } from '@shared/types'
import { FocusButton, Logo, Overlay } from './components'
import {
  FocusZone,
  useAction,
  useFocusable,
  useFocusContext,
  useSuspendGamepad,
  useKeyLabel
} from './input/focus'
import { Icon, type IconName } from './icons'
import { useApp, useDownloads, useI18n, type Route } from './state'
import { readPresentation } from './library-presentation'
import { isUtilityRoute } from './history'
import { UtilityNavigation, UTILITY_ITEMS } from './components/UtilityNavigation'
import { BiosScreen } from './screens/Bios'
import { GameScreen } from './screens/Game'
import { CollectionScreen } from './screens/Collections/CollectionScreen'
import { CollectionsScreen } from './screens/Collections'
import { DownloadsScreen } from './screens/Downloads'
import { EmulatorsScreen } from './screens/Emulators'
import { InstallEmulatorScreen } from './screens/Wizards/InstallEmulator'
import { SetupScreen } from './screens/Wizards/Setup'
import { HomeScreen } from './screens/Home'
import { LibraryScreen } from './screens/Library'
import { SystemsScreen } from './screens/Systems'
import { SettingsScreen } from './screens/Settings'
import { RunningOverlay } from './RunningOverlay'
import { ThemesNotice } from './ThemesNotice'
import { Toasts } from './Toasts'

/** Library-first shell. Utility routes remain available in the account/tools menu. */
export function App(): JSX.Element {
  const { t } = useI18n()
  const { route, goBack, canGoBack, navigate, offline, runningRomId, runningEmulator } = useApp()
  const { enterZone, retainFocus } = useFocusContext()
  const keyLabel = useKeyLabel()
  const inPlatform = route.name === 'library' && route.view?.platformId !== undefined
  const inUtility = isUtilityRoute(route)
  const [toolsOpen, setToolsOpen] = useState(false)
  useEffect(() => {
    document.documentElement.dataset.coverSize = readPresentation(localStorage).coverSize
  }, [])
  const back = useCallback((): void => {
    retainFocus(null)
    if (route.name === 'library' && route.view?.platformId !== undefined)
      return navigate({ name: 'systems', platformId: route.view.platformId })
    if (canGoBack) return goBack()
    if (isUtilityRoute(route)) return navigate({ name: 'home' })
    setToolsOpen(true)
  }, [route, canGoBack, goBack, navigate, retainFocus])
  useAction('back', back, route.name !== 'setup' && route.name !== 'install-emulator')
  useAction(
    'header',
    () => {
      if (!enterZone('nav'))
        enterZone(
          route.name === 'systems'
            ? 'systems-list'
            : route.name === 'collections'
              ? 'collections-list'
              : 'content'
        )
    },
    route.name !== 'library' && route.name !== 'collection' && route.name !== 'setup'
  )
  const cycleSection = (delta: -1 | 1): boolean => {
    // Platform/detail/modal shoulders retain their own visible context.
    if (inPlatform) return false
    const tabs: Route[] = [
      { name: 'home' },
      { name: 'systems' },
      ...(!offline ? [{ name: 'collections' } as Route] : []),
      { name: 'library' }
    ]
    const active = route.name === 'collection' ? 'collections' : route.name
    const index = tabs.findIndex((tab) => tab.name === active)
    if (index < 0) return false
    const target = tabs[(index + delta + tabs.length) % tabs.length]
    retainFocus('nav-' + target.name)
    navigate(target)
    return true
  }
  useAction('tabLeft', () => cycleSection(-1))
  useAction('tabRight', () => cycleSection(1))
  useAction('menu', () => setToolsOpen(true), route.name !== 'setup')
  const covered = runningRomId !== null || runningEmulator !== null
  useSuspendGamepad(covered)
  if (route.name === 'setup')
    return (
      <div className="app" data-screen="setup">
        <SetupScreen />
        {covered ? <RunningOverlay /> : null}
        <Toasts />
      </div>
    )
  return (
    <div className="app" data-screen={route.name} data-utility={inUtility}>
      {inUtility ? (
        <UtilityNavigation route={route} onBack={back} onMenu={() => setToolsOpen(true)} />
      ) : !inPlatform && route.name !== 'game' ? (
        <FocusZone id="nav">
          <header className="topbar library-topbar app-header">
            <div className="topbar__brand">
              <Logo className="topbar__logo" />
            </div>
            <nav className="topbar__nav" aria-label={t('library.navigation')}>
              <span className="nav-bumper hint__key" aria-hidden="true">
                {keyLabel('LB')}
              </span>
              <NavItem
                icon="home"
                label={t('nav.home')}
                route={{ name: 'home' }}
                active={route.name === 'home'}
              />
              <NavItem
                icon="library"
                label={t('library.systems')}
                route={{ name: 'systems' }}
                active={
                  route.name === 'systems' ||
                  (route.name === 'library' && route.view?.platformId !== undefined)
                }
              />
              {!offline ? (
                <NavItem
                  icon="collection"
                  label={t('nav.collections')}
                  route={{ name: 'collections' }}
                  active={route.name === 'collections' || route.name === 'collection'}
                />
              ) : null}
              <NavItem
                icon="search"
                label={t('action.search')}
                route={{ name: 'library' }}
                active={route.name === 'library' && route.view?.platformId === undefined}
              />
              <span className="nav-bumper hint__key" aria-hidden="true">
                {keyLabel('RB')}
              </span>
            </nav>
            <div className="topbar__utilities">
              {offline ? (
                <span className="topbar__offline" title={t('app.offline')}>
                  <Icon name="warn" size={18} />
                </span>
              ) : null}
              <DownloadsNavItem active={route.name === 'downloads'} />
              <NavItem
                icon="user"
                label={t('action.menu')}
                route={{ name: 'settings' }}
                onSelect={() => setToolsOpen(true)}
                active={toolsOpen || ['settings', 'bios', 'emulators'].includes(route.name)}
                compact
              />
            </div>
          </header>
        </FocusZone>
      ) : null}
      <FocusZone id="content">
        <Screen route={route} />
      </FocusZone>
      {toolsOpen ? <ToolsMenu onClose={() => setToolsOpen(false)} /> : null}
      {covered ? <RunningOverlay /> : <ThemesNotice />}
      <Toasts />
    </div>
  )
}

function ToolsMenu({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useI18n()
  const [confirmingQuit, setConfirmingQuit] = useState(false)
  const cancelQuit = (): void => setConfirmingQuit(false)
  return (
    <Overlay
      title={t(confirmingQuit ? 'app.quitTitle' : 'action.menu')}
      onDismiss={confirmingQuit ? cancelQuit : onClose}
      compact
      sheer
    >
      {confirmingQuit ? (
        <MenuQuitActions onCancel={cancelQuit} />
      ) : (
        <ToolsMenuActions onClose={onClose} onQuit={() => setConfirmingQuit(true)} />
      )}
    </Overlay>
  )
}

function MenuQuitActions({ onCancel }: { onCancel: () => void }): JSX.Element {
  const { t } = useI18n()
  useAction('menu', onCancel)
  return (
    <div className="tools-menu">
      <FocusButton icon="back" variant="ghost" action="cancel-quit" autoFocus onSelect={onCancel}>
        {t('app.stay')}
      </FocusButton>
      <FocusButton
        icon="quit"
        variant="danger"
        action="confirm-quit"
        onSelect={() => void window.rommix.system.quit()}
      >
        {t('app.quitRomMix')}
      </FocusButton>
    </div>
  )
}

function ToolsMenuActions({
  onClose,
  onQuit
}: {
  onClose: () => void
  onQuit: () => void
}): JSX.Element {
  const { t } = useI18n()
  const { navigate } = useApp()
  useAction('menu', onClose)
  const go = (route: Route): void => {
    onClose()
    navigate(route)
  }
  return (
    <div className="tools-menu">
      {UTILITY_ITEMS.map((item, index) => (
        <FocusButton
          key={item.name}
          icon={item.icon}
          variant="ghost"
          action={`open-${item.name}`}
          autoFocus={index === 0}
          onSelect={() => go({ name: item.name })}
        >
          {t(item.label)}
        </FocusButton>
      ))}
      <hr />
      <FocusButton icon="quit" variant="ghost" action="menu-quit" onSelect={onQuit}>
        {t('app.quitRomMix')}
      </FocusButton>
    </div>
  )
}

function DownloadsNavItem({ active }: { active: boolean }): JSX.Element {
  const { t } = useI18n()
  const busy = useDownloads().filter((item) => isInProgress(item.state)).length
  return (
    <NavItem
      icon="downloads"
      label={t('nav.downloads')}
      route={{ name: 'downloads' }}
      active={active}
      badge={busy || undefined}
      compact
    />
  )
}

function Screen({ route }: { route: Route }): JSX.Element {
  switch (route.name) {
    case 'home':
      return <HomeScreen view={route.view} />
    case 'systems':
      return <SystemsScreen selected={route.platformId} />
    case 'library':
      return <LibraryScreen view={route.view} />
    case 'game':
      return <GameScreen romId={route.romId} fromVersions={route.fromVersions} />
    case 'collections':
      return <CollectionsScreen view={route.view} />
    case 'collection':
      return (
        <CollectionScreen collectionId={route.collectionId} title={route.title} view={route.view} />
      )
    case 'downloads':
      return <DownloadsScreen />
    case 'bios':
      return <BiosScreen />
    case 'emulators':
      return <EmulatorsScreen />
    case 'install-emulator':
      return (
        <InstallEmulatorScreen
          emulatorId={route.emulatorId}
          system={route.system}
          platform={route.platform}
          changeVersion={route.changeVersion}
        />
      )
    case 'settings':
      return <SettingsScreen open={route.open} />
    case 'setup':
      return <SetupScreen />
  }
}

function NavItem({
  icon,
  label,
  route,
  active,
  badge,
  compact = false,
  onSelect
}: {
  icon: IconName
  label: string
  route: Route
  active: boolean
  badge?: number
  compact?: boolean
  onSelect?: () => void
}): JSX.Element {
  const { navigate } = useApp()
  const { retainFocus } = useFocusContext()
  const { ref, props } = useFocusable({
    id: 'nav-' + route.name,
    onSelect:
      onSelect ??
      (() => {
        retainFocus(route.name === 'downloads' ? 'utility-downloads' : 'nav-' + route.name)
        navigate(route)
      }),
    actionLabel: label
  })
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      className="nav-item"
      data-active={active}
      data-route={route.name}
      data-compact={compact}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={20} />
      {!compact ? <span className="nav-item__label">{label}</span> : null}
      {badge ? <span className="nav-item__badge">{badge}</span> : null}
    </button>
  )
}
