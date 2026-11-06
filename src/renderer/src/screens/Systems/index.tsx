import { BrowseChoices } from '../../components/BrowseChoices'
import {
  groupSystems,
  platformGeneration,
  readSystems,
  writeSystems,
  type SystemGrouping
} from '../../systems-presentation'
import { Fragment, useEffect, useMemo, useState, type JSX, type Ref } from 'react'
import { resolveSystem } from '@config/systems'
import type { RommPlatform } from '@shared/types'
import { Hints, PageTitle, PlatformIcon, Spinner, TextField } from '../../components'
import { FocusZone, useFocusable } from '../../input/focus'
import { LetterGlimpse } from '../../components/LetterGlimpse'
import { useApp, useI18n } from '../../state'
import { Icon } from '../../icons'

export function SystemsScreen({ selected }: { selected?: number }): JSX.Element {
  const { t } = useI18n()
  const { offline, installed, settings, navigate, revise } = useApp()
  const [presentation, setPresentation] = useState(() => readSystems(localStorage))
  const [search, setSearch] = useState('')
  const [didEnter, setDidEnter] = useState(false)
  useEffect(() => writeSystems(localStorage, presentation), [presentation])
  const [platforms, setPlatforms] = useState<RommPlatform[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (offline === null) return
    let current = true
    setLoading(true)
    void window.rommix.library
      .platforms()
      .then((items) => {
        if (current) {
          setPlatforms(items)
          setError(null)
        }
      })
      .catch((cause: Error) => {
        if (current) setError(cause.message)
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [offline])
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const game of installed) result.set(game.system, (result.get(game.system) ?? 0) + 1)
    return result
  }, [installed])
  useEffect(() => {
    if (platforms.length) setDidEnter(true)
  }, [platforms])
  const localCount = (p: RommPlatform): number =>
    counts.get(resolveSystem(p.slug, p.fs_slug, settings?.systemOverrides) ?? '') ?? 0
  const systems = platforms
    .filter((p) =>
      [p.display_name, p.family_name, p.category].some((value) =>
        value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      )
    )
    .filter((p) => {
      const system = resolveSystem(p.slug, p.fs_slug, settings?.systemOverrides)
      return offline ? !!system && (counts.get(system) ?? 0) > 0 : p.rom_count > 0
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
  const groups = groupSystems(systems, presentation, localCount)
  const groupName = (key: string): string =>
    presentation.groupBy === 'none'
      ? ''
      : !key
        ? t(
            presentation.groupBy === 'generation'
              ? 'systems.unknownGeneration'
              : 'systems.unclassified'
          )
        : presentation.groupBy === 'local'
          ? key === 'local'
            ? t('systems.local')
            : t('systems.serverOnly')
          : presentation.groupBy === 'generation'
            ? t('systems.generationNumber', { number: key })
            : key.replaceAll('_', ' ')
  return (
    <div className="content systems-screen" data-systems-layout={presentation.layout}>
      <div className="library-heading">
        <PageTitle>{t('library.systems')}</PageTitle>
      </div>
      {offline ? <div className="notice notice--warn">{t('app.offlineNotice')}</div> : null}
      {error ? <div className="notice notice--error">{error}</div> : null}
      <div className="library-toolbar systems-toolbar" data-focus-down="systems-list">
        <TextField
          field="systems-search"
          label={t('library.searchLabel')}
          placeholder={t('library.searchLabel')}
          value={search}
          onChange={setSearch}
        />
        <div className="library-control" data-control="systems-group">
          <span>{t('library.grouping')}</span>
          <BrowseChoices
            value={presentation.groupBy}
            onChange={(groupBy: SystemGrouping) => setPresentation((p) => ({ ...p, groupBy }))}
            options={['none', 'letter', 'family', 'category', 'generation', 'local'].map(
              (value) => ({
                value: value as SystemGrouping,
                label:
                  value === 'none'
                    ? t('library.ungrouped')
                    : value === 'letter'
                      ? 'ABC'
                      : value === 'family'
                        ? t('systems.family')
                        : value === 'category'
                          ? t('systems.category')
                          : value === 'generation'
                            ? t('systems.generation')
                            : t('systems.availability')
              })
            )}
          />
        </div>
        <div className="library-control" data-control="systems-sort">
          <span>{t('library.order')}</span>
          <BrowseChoices
            value={presentation.sort}
            onChange={(sort: 'name' | 'count') => setPresentation((p) => ({ ...p, sort }))}
            options={[
              { value: 'name', label: 'ABC' },
              { value: 'count', label: t('home.romCount') }
            ]}
          />
        </div>
        <div className="library-control" data-control="systems-direction">
          <span>{t('library.order')}</span>
          <BrowseChoices
            value={presentation.direction}
            onChange={(direction: 'asc' | 'desc') => setPresentation((p) => ({ ...p, direction }))}
            options={[
              { value: 'asc', label: '↑' },
              { value: 'desc', label: '↓' }
            ]}
          />
        </div>
        <div className="library-control" data-control="systems-layout">
          <span>{t('library.view')}</span>
          <BrowseChoices
            value={presentation.layout}
            onChange={(layout: 'grid' | 'list') => setPresentation((p) => ({ ...p, layout }))}
            options={[
              { value: 'grid', label: t('library.grid') },
              { value: 'list', label: t('library.list') }
            ]}
          />
        </div>
      </div>
      <FocusZone id="systems-list">
        <div className="systems-grid" data-focus-collection={presentation.layout}>
          {groups.map((group) => (
            <Fragment key={group.key}>
              {groupName(group.key) ? (
                <h2 className="systems-heading">{groupName(group.key)}</h2>
              ) : null}
              {group.items.map((platform) => {
                const system = resolveSystem(
                  platform.slug,
                  platform.fs_slug,
                  settings?.systemOverrides
                )
                return (
                  <SystemTile
                    key={platform.id}
                    platform={platform}
                    list={presentation.layout === 'list'}
                    local={system ? (counts.get(system) ?? 0) : 0}
                    offline={!!offline}
                    autoFocus={
                      !didEnter &&
                      (selected === platform.id ||
                        (selected === undefined && platform.id === systems[0]?.id))
                    }
                    onSelect={() => {
                      revise({ name: 'systems', platformId: platform.id })
                      navigate({
                        name: 'library',
                        view: { scope: 'all', search: '', platformId: platform.id }
                      })
                    }}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
      </FocusZone>
      <LetterGlimpse />
      {loading ? (
        <Spinner />
      ) : !systems.length && !error ? (
        <div className="empty">{t('library.noMatches')}</div>
      ) : null}
      <Hints
        items={[
          { key: 'A', label: t('action.open') },
          { key: 'SELECT', label: t('library.headerReturn') },
          { key: 'B', label: t('action.back') }
        ]}
      />
    </div>
  )
}

function SystemTile({
  platform,
  list,
  local,
  offline,
  autoFocus,
  onSelect
}: {
  platform: RommPlatform
  list: boolean
  local: number
  offline: boolean
  autoFocus: boolean
  onSelect: () => void
}): JSX.Element {
  const { t } = useI18n()
  const { ref, props } = useFocusable({ onSelect, autoFocus, actionLabel: t('action.open') })
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      className="system-tile"
      data-system={platform.id}
      data-focus-label={platform.display_name}
      {...props}
    >
      <PlatformIcon slug={platform.slug} size={list ? 44 : 72} label={platform.display_name} />
      <span className="system-tile__name">{platform.display_name}</span>
      <span className="system-tile__taxonomy">
        {[
          platform.family_name,
          platform.category?.replaceAll('_', ' '),
          platformGeneration(platform)
            ? t('systems.generationNumber', { number: platformGeneration(platform)! })
            : null
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <span className="system-tile__stats">
        {!offline ? (
          <span className="system-tile__count">
            {t('library.systemRoms', { count: platform.rom_count })}
          </span>
        ) : null}
        <span
          className="system-tile__local"
          data-local={local > 0}
          aria-label={t('library.localCopies', { count: local })}
          title={t('library.localCopies', { count: local })}
        >
          <Icon name="download" size={12} /> {local}
        </span>
      </span>
    </button>
  )
}
