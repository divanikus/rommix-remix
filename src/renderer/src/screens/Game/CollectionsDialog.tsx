import { type JSX, type Ref, useEffect, useRef, useState } from 'react'
import type { RommCollection } from '@shared/types'
import { FocusButton, Overlay, Spinner, StatusPill, TextField } from '../../components'
import { Icon } from '../../icons'
import { useFocusable } from '../../input/focus'
import { useI18n } from '../../state'

/**
 * Which of the user's shelves this game is on, and a press to change it.
 *
 * A list of toggles rather than an add-to picker, because both directions are
 * the same question: the row says whether it is on the shelf, and pressing it
 * says the opposite. An "add to…" that cannot take a game off again would leave
 * the only way to do that in RomM's web interface.
 *
 * Two kinds are left out. RomM's virtual collections — a shelf per genre, per
 * franchise — are built from metadata and have nothing to add to; and the
 * favourites collection has the heart on the row above, which would otherwise
 * be two controls for one fact.
 *
 * Each row is written to the server as it is pressed, and shown as the answer
 * before the server has confirmed it. The alternative is a list that does
 * nothing for a round trip and then moves under the cursor, and a collection
 * edit is not a thing worth watching a spinner for. A failure puts the row back
 * and says so.
 */
export function CollectionsDialog({
  romId,
  onClose,
  onMembershipChange,
  onError
}: {
  romId: number
  onClose: () => void
  onMembershipChange: (member: boolean) => void
  onError: (message: string) => void
}): JSX.Element {
  const { t } = useI18n()
  const [collections, setCollections] = useState<RommCollection[] | null>(null)
  const [members, setMembers] = useState<ReadonlySet<number>>(new Set())
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmedMembers = useRef(new Set<number>())
  const membershipChanged = useRef(onMembershipChange)
  useEffect(() => {
    membershipChanged.current = onMembershipChange
  }, [onMembershipChange])
  const pendingCreate = useRef(false)
  const pendingMembers = useRef(new Set<number>())

  /**
   * Held in a ref rather than listed as a dependency.
   *
   * `GameScreen` builds this handler inline, so it is a new function on every
   * render — and it calls `useDownloads()`, so it re-renders on every tick of
   * the transfer queue. Depending on it asked RomM for the whole collection
   * list about four times a second with any download running, and each answer
   * landing overwrote the optimistic toggle below, so the row a person had
   * just switched on flipped back off under them.
   */
  const report = useRef(onError)
  useEffect(() => {
    report.current = onError
  }, [onError])

  useEffect(() => {
    let alive = true
    void window.rommix.library
      .collections()
      .then((all) => {
        if (!alive) return
        const own = all.filter((entry) => !entry.is_virtual && !entry.is_favorite)
        setCollections(own)
        confirmedMembers.current = new Set(
          own.filter((e) => e.rom_ids.includes(romId)).map((e) => e.id)
        )
        setMembers(new Set(confirmedMembers.current))
        membershipChanged.current(confirmedMembers.current.size > 0)
      })
      .catch((cause: Error) => {
        if (!alive) return
        setCollections([])
        setError(cause.message)
        report.current(cause.message)
      })
    return () => {
      alive = false
    }
  }, [romId])

  const toggle = async (
    collection: RommCollection,
    member = !members.has(collection.id)
  ): Promise<void> => {
    if (pendingMembers.current.has(collection.id)) return
    pendingMembers.current.add(collection.id)
    setError(null)
    setMembers((current) => {
      const next = new Set(current)
      if (member) next.add(collection.id)
      else next.delete(collection.id)
      return next
    })
    try {
      await window.rommix.library.setCollection(romId, collection.id, member)
      if (member) confirmedMembers.current.add(collection.id)
      else confirmedMembers.current.delete(collection.id)
      membershipChanged.current(confirmedMembers.current.size > 0)
      setCollections(
        (current) =>
          current?.map((entry) => {
            if (entry.id !== collection.id) return entry
            const ids = new Set(entry.rom_ids)
            if (member) ids.add(romId)
            else ids.delete(romId)
            return { ...entry, rom_ids: [...ids], rom_count: ids.size }
          }) ?? null
      )
    } catch (cause) {
      setMembers((current) => {
        const next = new Set(current)
        if (member) next.delete(collection.id)
        else next.add(collection.id)
        return next
      })
      setError((cause as Error).message)
    } finally {
      pendingMembers.current.delete(collection.id)
    }
  }

  const create = async (): Promise<void> => {
    if (pendingCreate.current || !name.trim()) return
    pendingCreate.current = true
    setSaving(true)
    setError(null)
    try {
      const collection = await window.rommix.library.createCollection(name.trim())
      // Keep the server-created shelf even if the separate membership request
      // fails. The row can retry adding the game without creating a duplicate.
      setCollections((current) => [...(current ?? []), collection])
      setCreating(false)
      setName('')
      await toggle(collection, true)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      pendingCreate.current = false
      setSaving(false)
    }
  }

  return (
    <Overlay title={t('collections.dialogTitle')} icon="collection" onDismiss={onClose}>
      {!collections ? <Spinner /> : null}

      {!creating && error ? (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      ) : null}
      {collections && collections.length === 0 && !error ? (
        <p className="muted">{t('collections.none')}</p>
      ) : null}

      {collections && collections.length > 0 ? (
        <ul className="asset-list">
          {collections.map((collection) => (
            <CollectionRow
              key={collection.id}
              collection={collection}
              member={members.has(collection.id)}
              onToggle={() => void toggle(collection)}
            />
          ))}
        </ul>
      ) : null}

      <div className="btn-row">
        <FocusButton
          icon="add"
          action="new-collection"
          onSelect={() => {
            setError(null)
            setCreating(true)
          }}
          disabled={saving || collections === null}
          autoFocus
        >
          {t('collections.create')}
        </FocusButton>
        <FocusButton icon="keep" action="close-collections" onSelect={onClose}>
          {t('action.close')}
        </FocusButton>
      </div>
      {creating ? (
        <Overlay
          title={t('collections.create')}
          icon="collection"
          onDismiss={() => setCreating(false)}
        >
          <TextField
            field="collection-name"
            label={t('collections.name')}
            value={name}
            onChange={setName}
            hint={t('collections.createHint')}
            autoFocus
          />
          {error ? (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="btn-row">
            <FocusButton
              action="create-collection"
              icon="add"
              variant="primary"
              disabled={saving || !name.trim()}
              onSelect={() => void create()}
            >
              {saving ? t('app.loading') : t('collections.createAndAdd')}
            </FocusButton>
            <FocusButton action="cancel-collection" onSelect={() => setCreating(false)}>
              {t('action.cancel')}
            </FocusButton>
          </div>
        </Overlay>
      ) : null}
    </Overlay>
  )
}

/** One shelf, and whether this game is on it. */
function CollectionRow({
  collection,
  member,
  onToggle
}: {
  collection: RommCollection
  member: boolean
  onToggle: () => void
}): JSX.Element {
  const { t } = useI18n()
  const { ref, props } = useFocusable({
    onSelect: onToggle,
    actionLabel: member ? t('collections.remove') : t('collections.add')
  })

  return (
    <li ref={ref as Ref<HTMLLIElement>} data-collection={collection.id} {...props}>
      <StatusPill tone={member ? 'ok' : 'off'}>
        <Icon name={member ? 'confirm' : 'add'} size={13} />
        {member ? t('collections.on') : t('collections.off')}
      </StatusPill>
      <span className="asset__name">{collection.name}</span>
      <span className="asset__meta">{t('library.count', { count: collection.rom_count })}</span>
    </li>
  )
}
