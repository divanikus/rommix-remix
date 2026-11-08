import { type JSX, type Ref } from 'react'
import type { MessageKey } from '@shared/i18n'
import type { RomUserStatus } from '@shared/types'
import { FocusButton, Overlay } from '../../components'
import { Icon, type IconName } from '../../icons'
import { useFocusable } from '../../input/focus'
import { useI18n } from '../../state'

/**
 * How far through the game the player says they are.
 *
 * One of a fixed few rather than a toggle, so a list of them is the honest
 * shape — and a list is what a controller walks. Pressing one closes the
 * dialog: unlike the collections beside it, a game has exactly one answer here,
 * so there is nothing further to say once it is given.
 *
 * Kept on RomM rather than in RomMix, which is the point of it: a game marked
 * finished from the sofa is finished in a browser and on the handheld too.
 */

/**
 * RomM's five, in the order somebody moves through them, and the way out.
 *
 * The colour is the same one the rest of the interface uses for a state of that
 * kind — the accent for something under way, green for something done, amber
 * for something abandoned, grey for nothing. Finished and completed share a
 * colour because they are the same answer told to different depths, and the
 * words are what separate them.
 */
const CHOICES: readonly {
  value: RomUserStatus | null
  label: MessageKey
  tone: 'ok' | 'warn' | 'info' | 'off'
  icon: IconName
}[] = [
  { value: 'incomplete', label: 'status.incomplete', tone: 'info', icon: 'statusPlaying' },
  { value: 'finished', label: 'status.finished', tone: 'ok', icon: 'statusFinished' },
  { value: 'completed_100', label: 'status.completed_100', tone: 'ok', icon: 'achievement' },
  { value: 'retired', label: 'status.retired', tone: 'warn', icon: 'statusRetired' },
  { value: 'never_playing', label: 'status.never_playing', tone: 'off', icon: 'cancel' },
  // Last, and offered always: a status set by accident is otherwise permanent
  // from here, and RomM's own field is nullable.
  { value: null, label: 'status.none', tone: 'off', icon: 'gameStatus' }
]

/** The action and picker share one status vocabulary. */
export function statusIcon(status: RomUserStatus | null): IconName {
  return CHOICES.find((entry) => entry.value === status)?.icon ?? 'gameStatus'
}

/** A picker choice, with the same word and icon as the game's status action. */
function StatusTag({ status }: { status: RomUserStatus | null }): JSX.Element | null {
  const { t } = useI18n()
  const choice = CHOICES.find((entry) => entry.value === status)
  if (!choice) return null

  return (
    <span className="chip chip--icon chip--status" data-state={choice.tone}>
      <Icon name={choice.icon} size={14} />
      {t(choice.label)}
    </span>
  )
}

export function StatusDialog({
  current,
  onChoose,
  onClose
}: {
  current: RomUserStatus | null
  onChoose: (status: RomUserStatus | null) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useI18n()

  return (
    <Overlay title={t('status.dialogTitle')} icon="confirm" onDismiss={onClose}>
      <ul className="asset-list">
        {CHOICES.map((choice) => (
          <StatusRow
            key={choice.value ?? 'none'}
            status={choice.value}
            label={t(choice.label)}
            chosen={choice.value === current}
            onSelect={() => onChoose(choice.value)}
          />
        ))}
      </ul>

      <div className="btn-row">
        <FocusButton icon="back" action="close-status" onSelect={onClose}>
          {t('action.close')}
        </FocusButton>
      </div>
    </Overlay>
  )
}

/** One answer, with the current choice marked and focused. */
function StatusRow({
  status,
  label,
  chosen,
  onSelect
}: {
  status: RomUserStatus | null
  /** The same word the tag carries, for the hint bar and for assistive tech. */
  label: string
  chosen: boolean
  onSelect: () => void
}): JSX.Element {
  const { ref, props } = useFocusable({
    onSelect,
    actionLabel: label,
    // Focus opens on the answer already given, so the dialog opens where the
    // player left it rather than at the top of a list they have to read.
    autoFocus: chosen
  })

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      data-status={status ?? 'none'}
      aria-current={chosen}
      {...props}
    >
      <StatusTag status={status} />
      {/* A mark on the one that is already set, and nothing at all on the rest:
          an icon on every row invites the question of what pressing it adds. */}
      {chosen ? <Icon name="confirm" size={15} /> : null}
    </li>
  )
}
