import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import type { LaunchChoice } from '@shared/types'
import { FocusButton } from '../../components'
import { FocusLayer, useAction, useFocusContext } from '../../input/focus'
import { useI18n } from '../../state'

/** The remembered launch and its alternatives stay together in the action row. */
export function PlayButton({
  onPlay,
  onOpen,
  onClose,
  onPick,
  hasVariants,
  menu,
  running,
  disabled,
  autoFocus
}: {
  onPlay: () => void
  onOpen: () => void
  onClose: () => void
  onPick: (variant: string) => void
  hasVariants: boolean
  menu: LaunchChoice | null
  running: boolean
  disabled: boolean
  autoFocus: boolean
}): JSX.Element {
  const { t } = useI18n()
  const anchor = useRef<HTMLDivElement>(null)
  const arrowId = useId()
  const menuId = useId()
  const { setFocus } = useFocusContext()
  const [returnToArrow, setReturnToArrow] = useState(false)
  useEffect(() => {
    if (!returnToArrow || menu || disabled) return
    setFocus(arrowId)
    setReturnToArrow(false)
  }, [returnToArrow, menu, disabled, arrowId, setFocus])
  const dismiss = (): void => {
    onClose()
    setReturnToArrow(true)
  }
  return (
    <div className="game-play" data-split={hasVariants} ref={anchor}>
      <FocusButton
        icon="play"
        action="play"
        variant="primary"
        onSelect={onPlay}
        disabled={disabled}
        autoFocus={autoFocus}
      >
        {running ? t('game.running') : t('game.play')}
      </FocusButton>
      {hasVariants ? (
        <FocusButton
          icon="more"
          action="run-with"
          variant="primary"
          onSelect={onOpen}
          disabled={disabled}
          focusId={arrowId}
          actionLabel={t('game.runWith')}
          popup={{ id: menuId, open: menu !== null }}
        />
      ) : null}
      {menu ? (
        <FocusLayer>
          <LaunchMenu
            id={menuId}
            anchor={anchor}
            choice={menu}
            onPick={onPick}
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
  onPick,
  onDismiss
}: {
  id: string
  anchor: RefObject<HTMLDivElement | null>
  choice: LaunchChoice
  onPick: (variant: string) => void
  onDismiss: () => void
}): JSX.Element {
  const { t } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
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
        <p className="muted">
          {t('game.variantBody', { emulator: choice.emulatorName, system: choice.system })}
        </p>
        <div className="launch-menu__options">
          {choice.options.map((option) => (
            <FocusButton
              key={option.id}
              icon={option.id === choice.chosen ? 'confirm' : 'emulator'}
              action={`variant-${option.id}`}
              actionLabel={option.label}
              onSelect={() => onPick(option.id)}
              autoFocus={option.id === (choice.chosen ?? choice.options[0]?.id)}
            >
              {option.label}
              {option.note ? ` · ${option.note}` : ''}
            </FocusButton>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
