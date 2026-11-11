import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type Ref,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { LANGUAGE_NAMES, LOCALES, type LanguageChoice as LanguageSetting } from '@shared/i18n'
import { FocusLayer, useAction, useFocusable, useFocusContext } from '../input/focus'
import { Icon } from '../icons'
import { useI18n } from '../state'

/** The same language dropdown in Settings and initial setup. */
export function LanguageChoice({
  value,
  onChange
}: {
  value: LanguageSetting
  onChange: (value: LanguageSetting) => void
}): JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [returnFocus, setReturnFocus] = useState(false)
  const id = useId()
  const triggerId = useId()
  const { setFocus } = useFocusContext()
  const { ref, props, focused } = useFocusable({
    id: triggerId,
    onSelect: () => setOpen(true),
    actionLabel: t('settings.language')
  })
  useEffect(() => {
    if (focused && !open) ref.current?.focus({ preventScroll: true })
  }, [focused, open, ref])
  useEffect(() => {
    if (!open && returnFocus) {
      setFocus(triggerId)
      setReturnFocus(false)
    }
  }, [open, returnFocus, setFocus, triggerId])
  const close = (): void => {
    setOpen(false)
    setReturnFocus(true)
  }
  return (
    <div className="setting">
      <div className="setting__text">
        <div className="setting__label" id={`${id}-label`}>
          {t('settings.language')}
        </div>
        <div className="setting__hint" id={`${id}-hint`}>
          {t('settings.languageHint')}
        </div>
      </div>
      <button
        className="btn language-choice"
        ref={ref as Ref<HTMLButtonElement>}
        data-action="language"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-describedby={`${id}-hint`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        {...props}
      >
        <Icon name="languages" />
        <span id={`${id}-value`}>{value === 'auto' ? t('value.auto') : LANGUAGE_NAMES[value]}</span>
        <Icon name="more" />
      </button>
      {open ? (
        <FocusLayer>
          <LanguageOptions
            id={id}
            anchor={ref}
            value={value}
            onDismiss={close}
            onPick={(next) => {
              close()
              onChange(next)
            }}
          />
        </FocusLayer>
      ) : null}
    </div>
  )
}

/** A portal keeps the dropdown clear of the settings/setup scroll container. */
function LanguageOptions({
  id,
  anchor,
  value,
  onPick,
  onDismiss
}: {
  id: string
  anchor: RefObject<HTMLElement | null>
  value: LanguageSetting
  onPick: (value: LanguageSetting) => void
  onDismiss: () => void
}): JSX.Element {
  const { t } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({ left: 0, top: 0 })
  useAction('back', onDismiss)
  useLayoutEffect(() => {
    const place = (): void => {
      if (!anchor.current || !panel.current) return
      const button = anchor.current.getBoundingClientRect()
      const { width, height } = panel.current.getBoundingClientRect()
      // The web preview uses root CSS zoom; Electron's window zoom already
      // reports all these values in one coordinate space.
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1
      const below = innerHeight - button.bottom - 16
      const top = below < height && button.top > below ? button.top - height - 6 : button.bottom + 6
      setPosition({
        left: Math.max(16, Math.min(button.left, innerWidth - width - 16)) / zoom,
        top: Math.max(16, Math.min(top, innerHeight - height - 16)) / zoom,
        maxWidth: (innerWidth - 32) / zoom,
        maxHeight: Math.min(
          26 * parseFloat(getComputedStyle(panel.current).fontSize),
          (innerHeight - 32) / zoom
        )
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
  const options: { value: LanguageSetting; label: string }[] = [
    { value: 'auto', label: t('value.auto') },
    ...LOCALES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] }))
  ]
  return createPortal(
    <div className="language-dropdown-backdrop" onClick={onDismiss}>
      <div
        className="language-dropdown"
        style={position}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.language')}
        onClick={(event) => event.stopPropagation()}
      >
        <div id={id} role="listbox" aria-label={t('settings.language')}>
          {options.map((option) => (
            <LanguageOption
              key={option.value}
              value={option.value}
              label={option.label}
              selected={option.value === value}
              onPick={onPick}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

function LanguageOption({
  value,
  label,
  selected,
  onPick
}: {
  value: LanguageSetting
  label: string
  selected: boolean
  onPick: (value: LanguageSetting) => void
}): JSX.Element {
  const { ref, props, focused } = useFocusable({
    onSelect: () => onPick(value),
    autoFocus: selected,
    actionLabel: label
  })
  // Keep assistive technology on the same option as the controller highlight.
  useEffect(() => {
    if (focused) ref.current?.focus({ preventScroll: true })
  }, [focused, ref])
  return (
    <button
      className="btn language-dropdown__option"
      ref={ref as Ref<HTMLButtonElement>}
      role="option"
      aria-selected={selected}
      lang={value === 'auto' ? undefined : value}
      data-option={value}
      {...props}
    >
      <span>{label}</span>
      {selected ? <Icon name="confirm" /> : null}
    </button>
  )
}
