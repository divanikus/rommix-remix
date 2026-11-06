import { useEffect, useRef, useState, type JSX } from 'react'
import type { RommRom } from '@shared/types'
import { CoverArt, FocusButton, tileFromRom, type GameTile } from '../../components'
import { useApp, useI18n, type HomeView } from '../../state'

type Open = (shelf: string, tile: GameTile, offset?: number) => void
const today = (): string => {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')
}
export function HomeWidgets({ open, view }: { open: Open; view?: HomeView }): JSX.Element | null {
  const { offline } = useApp()
  if (offline !== false) return null
  return (
    <div className="home-widgets">
      <DiscoveryWidget kind="pick" open={open} view={view} />
      <DiscoveryWidget kind="anniversary" open={open} view={view} />
    </div>
  )
}
function DiscoveryWidget({
  kind,
  open,
  view
}: {
  kind: 'pick' | 'anniversary'
  open: Open
  view?: HomeView
}): JSX.Element | null {
  const { t } = useI18n()
  const [day, setDay] = useState(today)
  const [items, setItems] = useState<RommRom[]>([])
  const [index, setIndex] = useState(0)
  const [offset, setOffset] = useState(view?.shelf === kind ? (view.discoveryOffset ?? 0) : 0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [request, setRequest] = useState(0)
  const serial = useRef(0)
  const first = useRef(true)
  const loadedDay = useRef(day)
  const nextIndex = useRef(0)
  useEffect(() => {
    if (kind !== 'anniversary') return
    const timer = setInterval(() => setDay(today()), 60000)
    return () => clearInterval(timer)
  }, [kind])
  useEffect(() => {
    const attempt = ++serial.current
    let current = true
    setLoading(true)
    setFailed(false)
    const restore = first.current && view?.shelf === kind ? view.romId : undefined
    const load =
      kind === 'pick'
        ? (restore ? window.rommix.library.rom(restore) : window.rommix.library.randomRom()).then(
            (rom) => ({ items: rom ? [rom] : [], total: rom ? 1 : 0 })
          )
        : window.rommix.library.anniversaries(day, offset)
    void load
      .then((page) => {
        if (!current || attempt !== serial.current) return
        const next = page?.items ?? []
        setItems(next)
        setTotal(page?.total ?? next.length)
        setIndex(
          restore
            ? Math.max(
                0,
                next.findIndex((r) => r.id === restore)
              )
            : Math.min(nextIndex.current, Math.max(0, next.length - 1))
        )
      })
      .catch(() => {
        if (current) setFailed(true)
      })
      .finally(() => {
        if (current) {
          setLoading(false)
          first.current = false
        }
      })
    return () => {
      current = false
    }
  }, [kind, day, offset, request, view?.shelf, view?.romId])
  useEffect(() => {
    if (loadedDay.current !== day) {
      loadedDay.current = day
      nextIndex.current = 0
      setOffset(0)
    }
  }, [day])
  const step = (delta: number): void => {
    if (loading) return
    const next = index + delta
    if (next >= 0 && next < items.length) {
      setIndex(next)
      return
    }
    if (delta > 0 && offset + items.length < total) {
      nextIndex.current = 0
      setOffset(offset + items.length)
      return
    }
    if (delta < 0 && offset > 0) {
      nextIndex.current = 23
      setOffset(Math.max(0, offset - 24))
    }
  }
  const rom = items[index]
  if (!loading && !failed && !rom) return null
  const year = rom?.metadatum?.first_release_date
    ? new Date(rom.metadatum.first_release_date).getUTCFullYear()
    : null
  return (
    <section className="home-widget" data-widget={kind} aria-busy={loading}>
      <div className="home-widget__heading">
        <h2>{t(kind === 'pick' ? 'home.randomPick' : 'home.anniversaries')}</h2>
        <div className="home-widget__arrows">
          {kind === 'pick' || failed ? (
            <FocusButton
              icon={kind === 'pick' ? 'random' : 'refresh'}
              variant="ghost"
              action="pick-again"
              actionLabel={t('home.pickAgain')}
              onSelect={() => {
                if (!loading) setRequest((n) => n + 1)
              }}
            />
          ) : (
            <>
              <FocusButton
                icon="previous"
                variant="ghost"
                action="anniversary-previous"
                actionLabel={t('home.previous')}
                onSelect={() => step(-1)}
              />
              <FocusButton
                icon="next"
                variant="ghost"
                action="anniversary-next"
                actionLabel={t('home.next')}
                onSelect={() => step(1)}
              />
            </>
          )}
        </div>
      </div>
      {rom ? (
        <FocusButton
          action={kind === 'pick' ? 'open-pick' : 'open-anniversary'}
          variant="ghost"
          actionLabel={t('action.open')}
          autoFocus={view?.shelf === kind}
          onSelect={() => {
            if (!loading && !failed) open(kind, tileFromRom(rom), offset)
          }}
        >
          <span className="home-widget__art">
            <CoverArt
              path={rom.path_cover_small ?? rom.path_cover_large}
              name={rom.name ?? rom.fs_name}
            />
          </span>
          <span className="home-widget__body">
            <strong>{rom.name ?? rom.fs_name}</strong>
            <span>{rom.platform_display_name}</span>
            <span>
              {kind === 'anniversary' && year
                ? t('home.yearsAgo', { count: Number(day.slice(0, 4)) - year })
                : [year, rom.regions[0]].filter(Boolean).join(' · ')}
            </span>
          </span>
        </FocusButton>
      ) : (
        <div className="home-widget__status">
          {t(failed ? 'home.discoveryFailed' : 'app.loading')}
        </div>
      )}
      <div className="home-widget__footer">
        {kind === 'anniversary' && rom ? (
          <small>
            {offset + index + 1} / {total}
          </small>
        ) : null}
        {failed && rom ? <small role="status">{t('home.discoveryFailed')}</small> : null}
      </div>
    </section>
  )
}
