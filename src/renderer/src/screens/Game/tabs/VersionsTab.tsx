import { type JSX, type Ref, useEffect, useState } from 'react'
import type { RommRom, RommSiblingRom } from '@shared/types'
import { StatusBadge } from '../../../components'
import { Icon } from '../../../icons'
import { useFocusable } from '../../../input/focus'
import { useI18n } from '../../../state'
import { markedVersion, pickedVersion, pickQuery, versionRows } from './versions'

/**
 * Every dump of this game, this one included.
 *
 * What a grouped grid owes the person using it: one tile stands for three
 * files, and without somewhere to say which three, the European copy of a game
 * has simply gone from the library. Including the copy being looked at, marked,
 * because the question is which of them to play rather than what else exists —
 * and the answer is only readable against the one already open.
 *
 * A sibling arrives as names alone, so the rest of each row is fetched when the
 * tab is opened rather than with the game: choosing between two dumps on
 * `(USA)` against `(Europe) (Rev A)` is choosing on a filename, and region,
 * revision and size are the facts the choice is actually made on. A handful of
 * requests, made only when somebody looks — and the rows are drawn from the
 * names first, so the list is never a spinner.
 *
 * Distinct metadata titles describe versions whose filenames are short codes.
 * The filename remains underneath. Where the titles are shared, filenames stay
 * the main labels, retaining tags that distinguish regions and revisions. Both
 * names arrive with the sibling, so labels do not wait for detail requests.
 *
 * One row is the version standing for the game — the one a grouped grid shows
 * and opens — and it says why: marked by this user in RomM, or picked by RomM
 * among versions nobody marked. See `markedVersion` and `pickedVersion`.
 */
export function VersionsTab({
  rom,
  siblings,
  installedIds,
  onOpen
}: {
  rom: RommRom
  siblings: readonly RommSiblingRom[]
  installedIds: Set<number>
  onOpen: (romId: number) => void
}): JSX.Element {
  const [details, setDetails] = useState<Map<number, RommRom>>(new Map())
  const marked = markedVersion(rom, siblings)
  /** RomM's pick where nothing is marked; null until it has answered, or if it cannot. */
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    setPicked(null)
    if (marked !== undefined) return
    let listening = true
    void window.rommix.library
      .roms(pickQuery(rom))
      .then((page) => {
        if (listening) setPicked(pickedVersion(page.items, rom, siblings))
      })
      // Without it the rows only lose a label; nothing on them depends on it.
      .catch(() => undefined)
    return () => {
      listening = false
    }
  }, [rom, siblings, marked])

  useEffect(() => {
    setDetails(new Map())
    let listening = true
    void Promise.all(
      // A version RomM will not describe keeps its row and loses its chips: the
      // name is what the row acts on, and it is already here.
      siblings.map((sibling) => window.rommix.library.rom(sibling.id).catch(() => null))
    ).then((fetched) => {
      if (!listening) return
      setDetails(new Map(fetched.filter((row) => row !== null).map((row) => [row.id, row])))
    })
    return () => {
      listening = false
    }
  }, [siblings])

  /**
   * The dumps in one list, ordered by the name on disk.
   *
   * By name rather than by which is the server's main sibling or which is open:
   * the order has to stay put as the tab is walked back into from a version it
   * opened, or the list reshuffles itself under whoever is choosing.
   */
  const rows = versionRows(rom, siblings)

  return (
    <ul className="asset-list">
      {rows.map((row) => (
        <VersionRow
          key={row.id}
          romId={row.id}
          title={row.title}
          filename={row.filename}
          detail={row.id === rom.id ? rom : details.get(row.id)}
          current={row.id === rom.id}
          standing={row.id === marked ? 'marked' : row.id === picked ? 'picked' : null}
          installed={installedIds.has(row.id)}
          onSelect={() => onOpen(row.id)}
        />
      ))}
    </ul>
  )
}

/**
 * One dump, as a row that is pressed rather than a row with a button on it.
 *
 * The whole row is the target because the whole row is the subject: there is
 * one thing to do with a version and it is to go to it, and a button off to
 * the right made that a second place to aim at from a sofa. The one that is
 * already open is not a target at all — it would lead to the page it is drawn
 * on — so it takes no highlight and the pad walks past it.
 */
function VersionRow({
  romId,
  title,
  filename,
  detail,
  current,
  standing,
  installed,
  onSelect
}: {
  romId: number
  title: string
  filename: string | null
  /** The record behind this dump, absent until it arrives. */
  detail: RommRom | undefined
  current: boolean
  /** Whether this is the version standing for the game, and who chose it. */
  standing: 'marked' | 'picked' | null
  installed: boolean
  onSelect: () => void
}): JSX.Element {
  const { t, formatBytes } = useI18n()
  const { ref, props } = useFocusable({
    onSelect,
    enabled: !current,
    actionLabel: t('action.open')
  })
  const regions = detail?.regions.join(', ')

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      // Which game this row leads to, for `npm run test:app` — the same handle a
      // card in the library carries. See CONTRIBUTING.
      data-rom={romId}
      {...props}
    >
      <span className="asset__icon">
        <Icon name="roms" size={17} />
      </span>
      {/* Always, and beside the facts rather than instead of them: whether a
          dump is on this disk is what the list is read for, and leaving it off
          the row that happens to be open hides it from the one version whose
          answer is already known. */}
      {installed ? (
        <StatusBadge tone="ok" icon="confirm" label={t('library.downloadedMark')} />
      ) : null}
      {regions ? (
        <span className="chip chip--icon">
          <Icon name="region" size={14} />
          {regions}
        </span>
      ) : null}
      {detail?.revision ? (
        <span className="chip chip--icon">
          <Icon name="revision" size={14} />
          {/* Worded as the banner words it, so a revision reads the same on the
              page it names and in the list of the others. */}
          {t('game.revision', { revision: detail.revision })}
        </span>
      ) : null}
      {detail ? (
        <span className="chip chip--icon">
          <Icon name="size" size={14} />
          {formatBytes(detail.fs_size_bytes)}
        </span>
      ) : null}
      <span className="asset__name version__name">
        <span>{title}</span>
        {filename ? <span className="version__filename">{filename}</span> : null}
      </span>
      {/* At the end of the row, where a row's own state belongs: in front it
          stood among the chips describing the file and pushed them out of line
          with every other row. */}
      {current || standing ? (
        <span className="asset__here">
          {standing === 'marked' ? (
            <StatusBadge
              tone="ok"
              icon="confirm"
              label={t('versions.marked')}
              title={t('versions.markedHint')}
            />
          ) : null}
          {standing === 'picked' ? (
            <StatusBadge
              tone="off"
              icon="group"
              label={t('versions.picked')}
              title={t('versions.pickedHint')}
            />
          ) : null}
          {current ? (
            <StatusBadge tone="info" icon="details" label={t('versions.current')} />
          ) : null}
        </span>
      ) : null}
    </li>
  )
}
