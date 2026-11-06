import { app } from 'electron'
import { spawn } from 'node:child_process'
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { extname, join } from 'node:path'
import type { InstalledRom, RommRom } from '@shared/types'
import type { Store } from './store.ts'
import type { RommClient } from './romm/index.ts'
import { romResourcePath } from '@shared/romm-resource'
import { rootPaths } from './root.ts'
import { realHome } from './xdg.ts'
import { log } from './log.ts'
import { t } from './i18n.ts'

export interface EsdeStatus {
  state: 'ready' | 'blocked' | 'deferred' | 'done'
  reason?: string
  roms?: string
  data?: string
  media?: string
  pending?: number
  needed?: string[]
}

interface MediaFile {
  kind: string
  extension: string
  source: string
  size: number
}
export interface Artwork {
  kind: string
  path: string
}

interface Job {
  server: string
  entry: InstalledRom
  fields: Record<string, string>
  artwork?: Artwork[]
  media?: MediaFile[]
}

/** Explicit RomM 5.4.1 fields mapped to ES-DE's supported media slots. */
export function esdeArtwork(rom: RommRom): Artwork[] {
  const s = rom.ss_metadata
  const candidates = [
    ['covers', rom.path_cover_large ?? rom.path_cover_small ?? s?.box2d_path],
    ['screenshots', rom.merged_screenshots?.[0]],
    ['videos', rom.path_video],
    ['manuals', rom.path_manual],
    ['fanart', s?.fanart_path],
    ['marquees', s?.marquee_path ?? s?.logo_path],
    ['backcovers', s?.box2d_back_path],
    ['3dboxes', s?.box3d_path],
    ['physicalmedia', s?.physical_path],
    ['titlescreens', s?.title_screen_path],
    ['miximages', s?.miximage_v2_path ?? s?.miximage_path]
  ] as const
  return candidates.flatMap(([kind, path]) => {
    const resource = romResourcePath(path)
    return resource ? [{ kind, path: resource }] : []
  })
}

/** The only writable fields. Player flags, statistics and emulator choices never enter a job. */
export function esdeFields(rom: RommRom): Record<string, string> {
  const m = rom.metadatum
  const release = m.first_release_date ? new Date(m.first_release_date) : null
  return {
    name: rom.name ?? rom.fs_name_no_ext,
    desc: rom.summary ?? '',
    genre: m.genres?.join(', ') ?? '',
    developer: m.developers?.join(', ') ?? '',
    publisher: m.publishers?.join(', ') ?? '',
    players: m.player_count ?? '',
    rating: m.average_rating ? String(Math.max(0, Math.min(1, m.average_rating / 100))) : '',
    releasedate:
      release && Number.isFinite(release.getTime())
        ? release.toISOString().slice(0, 10).replaceAll('-', '') + 'T000000'
        : ''
  }
}

/** Optional Python stdlib XML helper, isolated from credentials and emulators. */
export function esdeHelper(action: string, job?: Job): Promise<EsdeStatus> {
  if (process.platform !== 'linux')
    return Promise.resolve({ state: 'blocked', reason: 'Linux is required' })
  const script = app.isPackaged
    ? join(process.resourcesPath, 'esde-enrich.py')
    : join(app.getAppPath(), 'src/main/esde/enrich.py')
  return new Promise((resolve) => {
    const child = spawn('python3', ['-I', script], { stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => child.kill(), 20_000)
    const done = (result: EsdeStatus): void => {
      clearTimeout(timer)
      resolve(result)
    }
    child.on('error', () =>
      done({ state: 'blocked', reason: 'Python 3 is required for ES-DE enrichment' })
    )
    child.stdout.on('data', (part: Buffer) => {
      output += part.toString()
      if (output.length > 65536) child.kill()
    })
    child.stderr.resume()
    child.stdin.on('error', () => undefined)
    child.stdin.end(
      JSON.stringify({
        action,
        home: realHome(),
        job,
        cache: join(rootPaths().config, 'esde-pending/media')
      })
    )
    child.on('close', (code) => {
      try {
        if (code !== 0) throw new Error(t('settings.esdeUnavailable'))
        done(JSON.parse(output) as EsdeStatus)
      } catch {
        done({ state: 'blocked', reason: 'ES-DE configuration could not be verified' })
      }
    })
  })
}

/** Queue only the exact versions this client has just finished downloading. */
export class EsdeEnrichment {
  private busy = false
  private stopped = false
  private lastReason: string | undefined
  private readonly directory = join(rootPaths().config, 'esde-pending')
  private readonly timer: ReturnType<typeof setInterval>
  constructor(
    private readonly store: Store,
    private readonly client: RommClient,
    private readonly helper: typeof esdeHelper = esdeHelper
  ) {
    this.timer = setInterval(() => void this.drain(), 30_000)
    this.timer.unref()
  }

  stop(): void {
    this.stopped = true
    clearInterval(this.timer)
  }

  private enabled(): boolean {
    return (
      !this.stopped &&
      this.store.settings.enrichEsde &&
      this.store.settings.romStorage === 'emulator'
    )
  }

  private installed(job: Job): boolean {
    const current = this.store.getInstalled(job.entry.romId)
    return (
      !!current &&
      current.emulatorId === job.entry.emulatorId &&
      current.system === job.entry.system &&
      current.path === job.entry.path &&
      current.launchPath === job.entry.launchPath &&
      current.installedAt === job.entry.installedAt
    )
  }

  private mediaPath(job: Job, art: Artwork): string | null {
    if (!romResourcePath(art.path) || !/^[a-z0-9]+$/.test(art.kind)) return null
    const digest = createHash('sha256')
      .update(job.server + art.path)
      .digest('hex')
      .slice(0, 20)
    return join(this.directory, 'media', `${job.entry.romId}-${art.kind}-${digest}.media`)
  }

  async status(): Promise<EsdeStatus> {
    if (this.store.settings.romStorage !== 'emulator') {
      return {
        state: 'blocked',
        reason: 'Choose emulator ROM folders to use the verified EmuDeck library'
      }
    }
    const result = await this.helper('probe')
    result.reason ??= this.lastReason
    result.pending = (await readdir(this.directory).catch(() => [])).filter((n) =>
      n.endsWith('.json')
    ).length
    return result
  }

  async completed(rom: RommRom, entry: InstalledRom): Promise<void> {
    if (!this.enabled() || entry.emulatorId !== 'emudeck') return
    const server = this.store.server?.baseUrl
    if (!server) return
    const artwork = esdeArtwork(rom)
    const job: Job = { server, entry, fields: esdeFields(rom), artwork }
    await mkdir(this.directory, { recursive: true })
    const file = join(this.directory, `${entry.romId}.json`)
    await writeFile(file + '.tmp', JSON.stringify(job), { mode: 0o600 })
    await rename(file + '.tmp', file)
    void this.drain()
  }

  async drain(): Promise<void> {
    if (this.busy || !this.enabled()) return
    this.busy = true
    try {
      const names = await readdir(this.directory).catch(() => [])
      this.lastReason = undefined
      for (const name of names.filter((n) => /^\d+\.json$/.test(n))) {
        if (!this.enabled()) break
        try {
          const file = join(this.directory, name)
          const serialized = await readFile(file, 'utf8')
          const job = JSON.parse(serialized) as Job
          if (job.server !== this.store.server?.baseUrl) continue
          if (!this.installed(job)) {
            await unlink(file)
            await this.cleanMedia(job)
            continue
          }
          let result = await this.helper('publish', job)
          if (result.state === 'done' && job.artwork?.length) {
            job.media = []
            for (const art of job.artwork.filter((a) => result.needed?.includes(a.kind))) {
              if (
                !this.enabled() ||
                job.server !== this.store.server?.baseUrl ||
                !this.installed(job)
              )
                break
              const media = await this.fetchMedia(job, art)
              if (media) job.media.push(media)
            }
            if (!this.enabled() || job.server !== this.store.server?.baseUrl) break
            // Downloads can finish again or be removed while a large video streams.
            // Only the same queued completion may publish its staged media.
            if (!this.installed(job) || (await readFile(file, 'utf8')) !== serialized) continue
            result = await this.helper('publish', job)
          }
          if (result.state === 'done') {
            // A new completed transfer may have replaced this queued job meanwhile.
            if ((await readFile(file, 'utf8')) === serialized) {
              await unlink(file)
              await this.cleanMedia(job)
            }
          } else {
            this.lastReason = result.reason
            log.info('esde', 'metadata publication postponed', {
              romId: job.entry.romId,
              reason: result.reason
            })
            if (result.state === 'deferred') break
          }
        } catch (error) {
          // A damaged job or a failed asset must not starve unrelated downloads.
          this.lastReason = (error as Error).message
          log.warn('esde', 'queued publication did not finish', { reason: this.lastReason })
        }
      }
    } catch (error) {
      this.lastReason = (error as Error).message
      log.warn('esde', 'metadata publication did not finish', { reason: (error as Error).message })
    } finally {
      this.busy = false
    }
  }

  private async cleanMedia(job: Job): Promise<void> {
    for (const art of job.artwork ?? []) {
      const source = this.mediaPath(job, art)
      if (!source) continue
      for (const suffix of ['', '.json', '.part'])
        await unlink(source + suffix).catch(() => undefined)
    }
  }

  private async fetchMedia(job: Job, art: Artwork): Promise<MediaFile | null> {
    const source = this.mediaPath(job, art)
    if (!source) return null
    const directory = join(this.directory, 'media')
    await mkdir(directory, { recursive: true })
    try {
      const cached = JSON.parse(await readFile(source + '.json', 'utf8')) as MediaFile
      if (cached.source === source && (await stat(source)).size === cached.size) return cached
    } catch {
      /* No complete staged copy yet. */
    }
    const response = await this.client.asset(art.path, { signal: AbortSignal.timeout(300_000) })
    if (response.status === 404) {
      await response.body?.cancel()
      return null
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(t('error.esdeMedia', { status: response.status }))
    }
    const allowed =
      art.kind === 'videos'
        ? ['.mp4', '.mkv', '.avi', '.wmv', '.mov', '.webm', '.m4v']
        : art.kind === 'manuals'
          ? ['.pdf']
          : ['.png', '.jpg', '.webp']
    const extension =
      (
        {
          'image/png': '.png',
          'image/jpeg': '.jpg',
          'image/webp': '.webp',
          'application/pdf': '.pdf',
          'video/mp4': '.mp4',
          'video/webm': '.webm',
          'video/x-matroska': '.mkv',
          'video/quicktime': '.mov',
          'video/x-msvideo': '.avi',
          'video/x-ms-wmv': '.wmv'
        } as Record<string, string>
      )[response.headers.get('content-type')?.split(';')[0] ?? ''] ??
      extname(art.path).toLowerCase()
    if (!allowed.includes(extension) || !response.body) {
      await response.body?.cancel()
      return null
    }
    const reader = response.body.getReader()
    const output = await open(source + '.part', 'w', 0o600)
    let size = 0
    let complete = false
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > 512 * 1024 * 1024) throw new Error(t('error.esdeMediaSize'))
        await output.writeFile(value)
      }
      const expected = response.headers.get('content-length')
      if (expected && !response.headers.has('content-encoding') && size !== Number(expected))
        throw new Error(t('error.esdeMediaIncomplete'))
      await output.sync()
      complete = true
    } finally {
      await reader.cancel().catch(() => undefined)
      await output.close()
      if (!complete) await unlink(source + '.part').catch(() => undefined)
    }
    if (!size) {
      await unlink(source + '.part')
      return null
    }
    await rename(source + '.part', source)
    const record = { kind: art.kind, extension, source, size }
    await writeFile(source + '.json', JSON.stringify(record), { mode: 0o600 })
    return record
  }
}
