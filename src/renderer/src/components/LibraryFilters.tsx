import { useEffect, useState, type JSX, type ReactNode, type Ref } from 'react'
import {
  FACETS,
  FLAGS,
  filterCount,
  parseDuration,
  type Facet,
  type FilterCatalog,
  type FilterLogic,
  type LibraryFilters
} from '@shared/library-filters'
import type { RomQuery } from '@shared/types'
import { FocusZone, useAction, useFocusable, useFocusContext, useKeyLabel } from '../input/focus'
import { useI18n } from '../state'
import { Icon } from '../icons'
import { Overlay, Spinner } from './overlay'
import { Tabs, TextField } from './controls'

export function LibraryFilterButton({
  count,
  onSelect
}: {
  count: number
  onSelect: () => void
}): JSX.Element {
  const { t } = useI18n()
  const label = `${t('filters.title')}${count ? ` (${count})` : ''}`
  const { ref, props } = useFocusable({ id: 'library-filters', onSelect, actionLabel: label })
  return (
    <div className="library-control" data-control="filters">
      <span>{t('filters.title')}</span>
      <div className="segmented">
        <button
          ref={ref as Ref<HTMLButtonElement>}
          {...props}
          className="segmented__option"
          data-filter="library-filters"
          data-active={count > 0}
          aria-label={label}
          title={label}
        >
          <Icon name="filter" size={18} />
          {count ? <span>{count}</span> : null}
        </button>
      </div>
    </div>
  )
}

export function FilterButton({
  id,
  children,
  onSelect,
  autoFocus = false,
  checked,
  segmented = false,
  label
}: {
  id: string
  children: ReactNode
  onSelect: () => void
  autoFocus?: boolean
  checked?: boolean
  segmented?: boolean
  label?: string
}): JSX.Element {
  const { ref, props } = useFocusable({ id, onSelect, autoFocus, actionLabel: label })
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      {...props}
      className={segmented ? 'segmented__option' : 'btn filter-row'}
      data-filter={id}
      aria-pressed={checked}
      data-active={segmented ? checked : undefined}
      aria-label={label}
    >
      {children}
    </button>
  )
}

/** Drafts live only in this modal. B never applies a partially edited query. */
export function LibraryFilterDialog({
  value,
  query,
  onApply,
  onClose
}: {
  value: LibraryFilters
  query: RomQuery
  onApply: (value: LibraryFilters) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useI18n()
  return (
    <Overlay title={t('filters.title')} icon="filter" onDismiss={onClose}>
      <FilterDraft value={value} query={query} onApply={onApply} onClose={onClose} />
    </Overlay>
  )
}

function FilterDraft({
  value,
  query,
  onApply,
  onClose
}: {
  value: LibraryFilters
  query: RomQuery
  onApply: (value: LibraryFilters) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useI18n()
  const keyLabel = useKeyLabel()
  const { setFocus } = useFocusContext()
  const [section, setSection] = useState<'categories' | 'properties' | 'duration'>('categories')
  const [focusInvalidRange, setFocusInvalidRange] = useState(false)
  const [draft, setDraft] = useState(value)
  const [minHours, setMinHours] = useState(value.duration?.minHours?.toString() ?? '')
  const [maxHours, setMaxHours] = useState(value.duration?.maxHours?.toString() ?? '')
  const range = parseDuration(minHours, maxHours)
  const appliedDraft = { ...draft, duration: range.value }
  const [catalog, setCatalog] = useState<FilterCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facet, setFacet] = useState<Facet | null>(null)
  const [retry, setRetry] = useState(0)
  // The modal's scope is captured at opening. Edits never refetch option lists.
  const [scope] = useState(query)
  useEffect(() => {
    let current = true
    setError(null)
    void window.rommix.library
      .filterCatalog(scope)
      .then((result) => {
        if (current) setCatalog(result)
      })
      .catch((cause: Error) => {
        if (current) setError(cause.message)
      })
    return () => {
      current = false
    }
  }, [scope, retry])
  useEffect(() => {
    if (focusInvalidRange && section === 'duration') {
      // Wait for the newly mounted section's focus registrations to settle.
      const frame = requestAnimationFrame(() => {
        setFocus('filter-hours-min')
        setFocusInvalidRange(false)
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [focusInvalidRange, section, setFocus])
  useAction('header', () => setFocus('filter-apply'))
  const has = (key: string): boolean => !!catalog?.supported.includes(key)
  return (
    <div className="filter-panel">
      <FocusZone id="filter-tabs">
        <Tabs
          navigation="triggers"
          bumperHints
          autoFocus={section === 'categories'}
          tabs={[
            {
              id: 'categories',
              label: t('filters.categories'),
              badge: filterCount({ facets: draft.facets }) || undefined
            },
            {
              id: 'properties',
              label: t('filters.properties'),
              badge: filterCount({ flags: draft.flags }) || undefined
            },
            {
              id: 'duration',
              label: t('filters.durationTab'),
              badge: minHours.trim() || maxHours.trim() ? 1 : undefined
            }
          ]}
          active={section}
          onChange={setSection}
        />
      </FocusZone>
      <div className="filter-scroll filter-section" data-filter-section={section}>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <FilterButton id="filter-retry" onSelect={() => setRetry((n) => n + 1)}>
              {t('action.retry')}
            </FilterButton>
          </div>
        ) : null}
        {!catalog && !error ? <Spinner /> : null}
        {catalog && !catalog.supported.length ? <p>{t('filters.unavailable')}</p> : null}
        {section === 'categories' ? (
          <>
            <p className="filter-help">{t('filters.help')}</p>
            <FocusZone id="filter-fields">
              <div className="filter-fields">
                {FACETS.filter(has).map((key) => {
                  const selected = draft.facets?.[key]
                  return (
                    <FilterButton key={key} id={`filter-${key}`} onSelect={() => setFacet(key)}>
                      <span>{t(`filters.${key}`)}</span>
                      <small>
                        {selected?.values.length
                          ? `${t(`filters.${selected.logic}`)} · ${selected.values.length}`
                          : t('filters.anyValue')}
                      </small>
                      <Icon name="next" />
                    </FilterButton>
                  )
                })}
              </div>
            </FocusZone>
          </>
        ) : null}
        {section === 'duration' && has('hltb_main_story_min') && has('hltb_main_story_max') ? (
          <FocusZone id="filter-duration">
            <div className="filter-duration">
              <h3>{t('filters.duration')}</h3>
              {[
                { id: 'min', label: t('filters.fromHours'), value: minHours, set: setMinHours },
                { id: 'max', label: t('filters.toHours'), value: maxHours, set: setMaxHours }
              ].map((bound) => (
                <div key={bound.id} className="filter-bound">
                  <TextField
                    focusId={`filter-hours-${bound.id}`}
                    field={`filter-hours-${bound.id}`}
                    label={bound.label}
                    value={bound.value}
                    onChange={bound.set}
                    placeholder={t('filters.anyValue')}
                  />
                  <FilterButton
                    id={`filter-hours-${bound.id}-minus`}
                    label={`${bound.label}: −1`}
                    onSelect={() =>
                      bound.set(
                        String(Math.max(0, (Number(bound.value.replace(',', '.')) || 0) - 1))
                      )
                    }
                  >
                    −
                  </FilterButton>
                  <FilterButton
                    id={`filter-hours-${bound.id}-plus`}
                    label={`${bound.label}: +1`}
                    onSelect={() =>
                      bound.set(String((Number(bound.value.replace(',', '.')) || 0) + 1))
                    }
                  >
                    +
                  </FilterButton>
                  <FilterButton
                    id={`filter-hours-${bound.id}-clear`}
                    onSelect={() => bound.set('')}
                  >
                    {t('filters.anyValue')}
                  </FilterButton>
                </div>
              ))}
              {!range.valid ? <p role="alert">{t('filters.invalidDuration')}</p> : null}
            </div>
          </FocusZone>
        ) : null}
        {section === 'properties' ? (
          <FocusZone id="filter-properties">
            <div className="filter-properties">
              {FLAGS.filter(has).map((key) => (
                <div key={key} className="library-control filter-property">
                  <span>{t(`filters.${key}`)}</span>
                  <div className="segmented" role="group" aria-label={t(`filters.${key}`)}>
                    {(['any', 'yes', 'no'] as const).map((choice) => {
                      const flagValue = choice === 'any' ? undefined : choice === 'yes'
                      const label = t(
                        choice === 'any'
                          ? 'filters.anyValue'
                          : choice === 'yes'
                            ? 'filters.yes'
                            : 'filters.no'
                      )
                      return (
                        <FilterButton
                          key={choice}
                          id={`filter-${key}-${choice}`}
                          segmented
                          label={`${t(`filters.${key}`)}: ${label}`}
                          checked={draft.flags?.[key] === flagValue}
                          onSelect={() =>
                            setDraft((d) => {
                              const flags = { ...d.flags }
                              if (flagValue === undefined) delete flags[key]
                              else flags[key] = flagValue
                              return { ...d, flags }
                            })
                          }
                        >
                          {label}
                        </FilterButton>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </FocusZone>
        ) : null}
        {catalog?.supported.length &&
        ((section === 'properties' && !FLAGS.some(has)) ||
          (section === 'categories' && !FACETS.some(has)) ||
          (section === 'duration' &&
            !(has('hltb_main_story_min') && has('hltb_main_story_max')))) ? (
          <p>{t('filters.unavailable')}</p>
        ) : null}
      </div>
      <FocusZone id="filter-actions">
        <div className="filter-footer">
          <p>
            {keyLabel('A')} · {t('filters.choose')}　{keyLabel('SELECT')} · {t('filters.actions')}　
            {' · '}
            {keyLabel('B')} · {t('filters.cancel')}
          </p>
          <div className="btn-row">
            <FilterButton
              id="filter-apply"
              onSelect={() => {
                if (range.valid) onApply(appliedDraft)
                else {
                  setSection('duration')
                  setFocusInvalidRange(true)
                }
              }}
            >
              {t('filters.apply')} ({filterCount(appliedDraft)})
            </FilterButton>
            <FilterButton
              id="filter-clear"
              onSelect={() => {
                setDraft({})
                setMinHours('')
                setMaxHours('')
              }}
            >
              {t('filters.clear')}
            </FilterButton>
            <FilterButton id="filter-cancel" onSelect={onClose}>
              {t('filters.cancel')}
            </FilterButton>
          </div>
        </div>
      </FocusZone>
      {facet && catalog ? (
        <FacetPicker
          key={facet}
          facet={facet}
          catalog={catalog}
          value={draft}
          onChange={setDraft}
          onClose={() => setFacet(null)}
        />
      ) : null}
    </div>
  )
}

function FacetPicker({
  facet,
  catalog,
  value,
  onChange,
  onClose
}: {
  facet: Facet
  catalog: FilterCatalog
  value: LibraryFilters
  onChange: (value: LibraryFilters) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useI18n()
  return (
    <Overlay title={t(`filters.${facet}`)} onDismiss={onClose}>
      <FacetOptions
        facet={facet}
        catalog={catalog}
        value={value}
        onChange={onChange}
        onClose={onClose}
      />
    </Overlay>
  )
}

function FacetOptions({
  facet,
  catalog,
  value,
  onChange,
  onClose
}: {
  facet: Facet
  catalog: FilterCatalog
  value: LibraryFilters
  onChange: (value: LibraryFilters) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useI18n()
  const keyLabel = useKeyLabel()
  const { setFocus, activate } = useFocusContext()
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(80)
  const selected = value.facets?.[facet] ?? { values: [], logic: 'any' as const }
  // Include held selections even when metadata changed since the last visit.
  const options = [...new Set([...(catalog.values[facet] ?? []), ...selected.values])]
    .sort((a, b) => a.localeCompare(b))
    .filter((v) => v.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const change = (values: string[], logic: FilterLogic = selected.logic): void =>
    onChange({ ...value, facets: { ...value.facets, [facet]: { values, logic } } })
  useAction('header', () => setFocus('filter-done'))
  useAction('search', () => {
    setFocus('filter-value-search')
    activate()
  })
  return (
    <div className="filter-panel">
      <FocusZone id="filter-search">
        <TextField
          focusId="filter-value-search"
          field="filter-value-search"
          label={t('action.search')}
          value={search}
          onChange={(text) => {
            setSearch(text)
            setShown(80)
          }}
        />
      </FocusZone>
      {catalog.supported.includes(`${facet}_logic`) ? (
        <FocusZone id="filter-logic">
          <div className="filter-logic btn-row">
            {(['any', 'all', 'none'] as const).map((logic) => (
              <FilterButton
                key={logic}
                id={`filter-logic-${logic}`}
                checked={selected.logic === logic}
                onSelect={() => change(selected.values, logic)}
              >
                {t(`filters.${logic}`)}
              </FilterButton>
            ))}
          </div>
        </FocusZone>
      ) : null}
      <div className="filter-scroll">
        <FocusZone id="filter-values">
          <div className="filter-values">
            {options.slice(0, shown).map((option, i) => (
              <FilterButton
                key={option}
                id={`filter-value-${i}`}
                autoFocus={i === 0}
                checked={selected.values.includes(option)}
                onSelect={() =>
                  change(
                    selected.values.includes(option)
                      ? selected.values.filter((v) => v !== option)
                      : [...selected.values, option]
                  )
                }
              >
                <span className="filter-check">
                  {selected.values.includes(option) ? <Icon name="confirm" /> : null}
                </span>
                <span>
                  {facet === 'statuses' &&
                  ['incomplete', 'finished', 'completed_100', 'retired', 'never_playing'].includes(
                    option
                  )
                    ? t(`status.${option}` as Parameters<typeof t>[0])
                    : option === 'now_playing'
                      ? t('filters.nowPlaying')
                      : option === 'backlogged'
                        ? t('filters.backlogged')
                        : option}
                </span>
              </FilterButton>
            ))}
            {!options.length ? <p>{t('filters.noValues')}</p> : null}
            {options.length > shown ? (
              <FilterButton id="filter-more" onSelect={() => setShown((n) => n + 80)}>
                {t('filters.more')}
              </FilterButton>
            ) : null}
          </div>
        </FocusZone>
      </div>
      <FocusZone id="filter-value-actions">
        <div className="filter-footer">
          <p>
            {keyLabel('A')} · {t('filters.choose')}　{keyLabel('Y')} · {t('action.search')}　{' · '}
            {keyLabel('SELECT')} · {t('filters.actions')}
            {' · '}
            {keyLabel('B')} · {t('filters.done')}
          </p>
          <div className="btn-row">
            <FilterButton id="filter-done" onSelect={onClose}>
              {t('filters.done')} ({selected.values.length})
            </FilterButton>
            <FilterButton id="filter-values-clear" onSelect={() => change([])}>
              {t('filters.clear')}
            </FilterButton>
          </div>
        </div>
      </FocusZone>
    </div>
  )
}
