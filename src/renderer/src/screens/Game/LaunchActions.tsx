import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import type { LaunchChoice, RommPlayer, RommPlayers } from '@shared/types'
import { FocusButton } from '../../components'
import { FocusLayer, useAction, useFocusContext } from '../../input/focus'
import { useI18n } from '../../state'

/** Keep launch alternatives beside the primary action, including before install. */
export function LaunchActions({
  children,
  readLocalChoice,
  onPickLocal,
  players,
  onPickRomm,
  disabled
}: {
  children?: ReactNode
  readLocalChoice?: () => Promise<LaunchChoice | null>
  onPickLocal: (variant: string) => void
  players: RommPlayers
  onPickRomm: (player: RommPlayer) => void
  disabled: boolean
}): JSX.Element | null {
  const { t } = useI18n()
  const anchor = useRef<HTMLDivElement>(null)
  const arrowId = useId()
  const menuId = useId()
  const { setFocus } = useFocusContext()
  const [menu, setMenu] = useState<{ local: LaunchChoice | null } | null>(null)
  const [returnToArrow, setReturnToArrow] = useState(false)
  const hasRemote = players.browser || players.stream
  const hasOptions = readLocalChoice !== undefined || hasRemote
  const local = readLocalChoice ? (menu?.local ?? null) : null
  const menuOpen = menu !== null && (Boolean(local?.options.length) || hasRemote)
  useEffect(() => {
    if (menu && !menuOpen) setMenu(null)
  }, [menu, menuOpen])
  useEffect(() => {
    if (!returnToArrow || menu || disabled) return
    if (hasOptions) setFocus(arrowId)
    setReturnToArrow(false)
  }, [returnToArrow, menu, disabled, hasOptions, arrowId, setFocus])
  const open = async (): Promise<void> => {
    const choice = readLocalChoice ? await readLocalChoice() : null
    if (choice?.options.length || hasRemote) setMenu({ local: choice })
  }
  const dismiss = (): void => {
    setMenu(null)
    setReturnToArrow(true)
  }
  if (!children && !hasOptions) return null
  return (
    <div className="game-play" data-split={Boolean(children) && hasOptions} ref={anchor}>
      {children}
      {hasOptions ? (
        <FocusButton
          icon="more"
          action="run-with"
          variant={children ? 'primary' : 'default'}
          onSelect={() => void open()}
          disabled={disabled}
          focusId={arrowId}
          actionLabel={t('game.runWith')}
          popup={{ id: menuId, open: menuOpen }}
        />
      ) : null}
      {menuOpen ? (
        <FocusLayer>
          <LaunchMenu
            id={menuId}
            anchor={anchor}
            choice={local}
            players={players}
            onPickLocal={(id) => {
              dismiss()
              onPickLocal(id)
            }}
            onPickRomm={(player) => {
              dismiss()
              onPickRomm(player)
            }}
            onDismiss={dismiss}
          />
        </FocusLayer>
      ) : null}
    </div>
  )
}

/** Portalled so the game's scrolling pane cannot cut off the choices. */
function LaunchMenu({
  id,
  anchor,
  choice,
  players,
  onPickLocal,
  onPickRomm,
  onDismiss
}: {
  id: string
  anchor: RefObject<HTMLDivElement | null>
  choice: LaunchChoice | null
  players: RommPlayers
  onPickLocal: (variant: string) => void
  onPickRomm: (player: RommPlayer) => void
  onDismiss: () => void
}): JSX.Element {
  const { t } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const localOptions = choice?.options ?? []
  useAction('back', onDismiss)
  useLayoutEffect(() => {
    const place = (): void => {
      if (!anchor.current || !panel.current) return
      const button = anchor.current.getBoundingClientRect()
      const { width, height } = panel.current.getBoundingClientRect()
      const below = innerHeight - button.bottom - 16
      const top = below < height && button.top > below ? button.top - height - 8 : button.bottom + 8
      setPosition({
        left: Math.max(16, Math.min(button.left, innerWidth - width - 16)),
        top: Math.max(16, Math.min(top, innerHeight - height - 16))
      })
    }
    place()
    const observer = new ResizeObserver(place)
    if (panel.current) observer.observe(panel.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])
  return createPortal(
    <div className="launch-menu-backdrop" onClick={onDismiss}>
      <div
        className="launch-menu"
        id={id}
        ref={panel}
        style={position}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={`${id}-title`}>{t('game.runWith')}</h2>
        {choice && localOptions.length > 0 ? (
          <p className="muted">
            {t('game.variantBody', { emulator: choice.emulatorName, system: choice.system })}
          </p>
        ) : null}
        <div className="launch-menu__options">
          {localOptions.map((option) => (
            <FocusButton
              key={option.id}
              icon={option.id === choice?.chosen ? 'confirm' : 'emulator'}
              action={`variant-${option.id}`}
              actionLabel={option.label}
              onSelect={() => onPickLocal(option.id)}
              autoFocus={option.id === (choice?.chosen ?? localOptions[0]?.id)}
            >
              {option.label}
              {option.note ? ` · ${option.note}` : ''}
            </FocusButton>
          ))}
          {players.browser ? (
            <FocusButton
              icon="homepage"
              action="play-on-romm"
              autoFocus={localOptions.length === 0}
              onSelect={() => onPickRomm('browser')}
            >
              {t('game.playOnRomm')}
            </FocusButton>
          ) : null}
          {players.stream ? (
            <FocusButton
              icon="server"
              action="stream-from-romm"
              autoFocus={localOptions.length === 0 && !players.browser}
              onSelect={() => onPickRomm('stream')}
            >
              {t('game.streamFromRomm')}
            </FocusButton>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}
