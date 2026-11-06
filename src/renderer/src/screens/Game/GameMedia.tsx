import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { romResourcePath } from '@shared/romm-resource'
import type { RommRom } from '@shared/types'
import { FocusButton } from '../../components'
import { FocusLayer, useAction, useTopFocusLayer } from '../../input/focus'
import { useApp, useI18n } from '../../state'
import { Shot, ShotViewer } from './tabs/ScreenshotsTab'

export function GameMedia({
  rom,
  mode = 'overview'
}: {
  rom: RommRom
  mode?: 'overview' | 'gallery'
}): JSX.Element | null {
  const { t } = useI18n()
  const [viewing, setViewing] = useState<number | null>(null)
  const [aspect, setAspect] = useState(4 / 3)
  const [columns, setColumns] = useState(3)
  const thumbnails = useRef<HTMLDivElement>(null)
  const shots = rom.merged_screenshots ?? []
  const gallery = mode === 'gallery'
  useEffect(() => {
    const element = thumbnails.current
    if (!element || gallery || !rom.path_video) return
    // Two rows beside the preview; fit more pictures as its native aspect leaves
    // room, instead of stretching two small screenshots across the whole column.
    const measure = (): void => {
      const { width, height } = element.getBoundingClientRect()
      const targetWidth = ((height - 14) / 2) * aspect
      setColumns(Math.max(1, Math.min(3, Math.round((width + 14) / (targetWidth + 14)))))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [gallery, rom.path_video, aspect])
  if (!rom.path_video && !shots.length)
    return gallery ? <div className="empty">{t('shots.empty')}</div> : null
  return (
    <>
      <div
        className={`game-media game-media--${mode}${rom.path_video ? ' game-media--video' : ''}`}
        style={{ '--video-aspect': aspect, '--shot-columns': columns } as CSSProperties}
      >
        {rom.path_video ? (
          <GameVideo
            key={rom.path_video}
            path={rom.path_video}
            poster={shots[0]}
            preview={!gallery}
            onAspect={setAspect}
          />
        ) : null}
        <div className="game-media__shots" ref={thumbnails}>
          {shots
            .slice(0, gallery ? shots.length : rom.path_video ? columns * 2 : 6)
            .map((path, index) => (
              <Shot key={path} path={path} onSelect={() => setViewing(index)} />
            ))}
        </div>
      </div>
      {viewing !== null ? (
        <ShotViewer
          shots={shots}
          index={viewing}
          onMove={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  )
}

function GameVideo({
  path,
  poster,
  preview,
  onAspect
}: {
  path: string
  poster?: string
  preview: boolean
  onAspect: (ratio: number) => void
}): JSX.Element {
  const { t } = useI18n()
  const { runningRomId, runningEmulator } = useApp()
  const topLayer = useTopFocusLayer()
  const video = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(false)
  const [foreground, setForeground] = useState(!document.hidden)
  const [paused, setPaused] = useState(true)
  const [muted, setMuted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [manualPause, setManualPause] = useState(false)
  const blocked =
    topLayer > (expanded ? 1 : 0) ||
    !foreground ||
    runningRomId !== null ||
    runningEmulator !== null
  const src = window.rommix.system.assetUrl(romResourcePath(path)) ?? undefined

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35] }
    )
    observer.observe(element)
    const hide = (): void => setForeground(false)
    const show = (): void => setForeground(!document.hidden)
    window.addEventListener('blur', hide)
    window.addEventListener('focus', show)
    document.addEventListener('visibilitychange', show)
    return () => {
      observer.disconnect()
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', show)
      document.removeEventListener('visibilitychange', show)
    }
  }, [])

  useEffect(() => {
    const element = video.current
    if (!element) return
    if (blocked || (!expanded && (!preview || !visible)) || manualPause || failed) {
      element.pause()
      return
    }
    // A settled card can preview with sound. Browsers which require activation
    // leave the poster in place; A on the media surface retries with a gesture.
    const timer = window.setTimeout(() => {
      void element.play().catch(() => setPaused(true))
    }, 650)
    return () => {
      window.clearTimeout(timer)
      element.pause()
    }
  }, [blocked, expanded, preview, visible, manualPause, failed])

  useEffect(() => {
    const element = video.current
    if (element && src) element.src = src
    return () => {
      if (element) {
        element.pause()
        element.removeAttribute('src')
        element.load()
      }
    }
  }, [src])

  const play = (): void => {
    setManualPause(false)
    if (failed) {
      setFailed(false)
      video.current?.load()
    }
    void video.current?.play().catch(() => setPaused(true))
  }
  const close = (): void => setExpanded(false)
  const seek = (seconds: number): void => {
    const element = video.current
    if (element && Number.isFinite(element.duration))
      element.currentTime = Math.max(0, Math.min(element.duration, element.currentTime + seconds))
  }

  return (
    <div
      ref={box}
      className={`game-video${expanded ? ' game-video--expanded' : ''}`}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      aria-label={t('game.tabMedia')}
    >
      <video
        ref={video}
        src={src}
        poster={poster ? (window.rommix.system.assetUrl(poster) ?? undefined) : undefined}
        preload="metadata"
        playsInline
        muted={muted}
        onLoadedMetadata={(event) => {
          const { videoWidth, videoHeight } = event.currentTarget
          if (videoWidth > 0 && videoHeight > 0) onAspect(videoWidth / videoHeight)
        }}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onError={() => setFailed(true)}
        onEnded={() => setManualPause(true)}
      />
      <div className="game-video__surface" data-playing={!paused} hidden={expanded}>
        <FocusButton
          icon={failed ? 'refresh' : paused ? 'play' : 'fullscreen'}
          action="video-expand"
          actionLabel={t(failed ? 'game.videoRetry' : 'game.videoExpand')}
          onSelect={() => {
            setExpanded(true)
            play()
          }}
        />
        {failed ? <span className="game-video__error">{t('game.videoUnavailable')}</span> : null}
      </div>
      {expanded ? (
        <FocusLayer>
          <VideoControls close={close}>
            <FocusButton
              icon={paused ? 'play' : 'pause'}
              action="video-play"
              actionLabel={t(paused ? 'game.videoPlay' : 'game.videoPause')}
              autoFocus
              onSelect={() => {
                if (paused) play()
                else {
                  setManualPause(true)
                  video.current?.pause()
                }
              }}
            />
            <FocusButton
              icon={muted ? 'mute' : 'sound'}
              action="video-sound"
              actionLabel={t(muted ? 'game.videoUnmute' : 'game.videoMute')}
              onSelect={() => setMuted(!muted)}
            />
            <FocusButton
              icon="previous"
              action="video-rewind"
              actionLabel={t('game.videoBack')}
              onSelect={() => seek(-10)}
            />
            <FocusButton
              icon="next"
              action="video-forward"
              actionLabel={t('game.videoForward')}
              onSelect={() => seek(10)}
            />
            <FocusButton icon="back" action="video-close" onSelect={close}>
              {t('action.back')}
            </FocusButton>
            {failed ? <span>{t('game.videoUnavailable')}</span> : null}
          </VideoControls>
        </FocusLayer>
      ) : null}
    </div>
  )
}

function VideoControls({
  close,
  children
}: {
  close: () => void
  children: import('react').ReactNode
}): JSX.Element {
  useAction('back', close)
  useAction('menu', close)
  return <div className="game-video__controls">{children}</div>
}
