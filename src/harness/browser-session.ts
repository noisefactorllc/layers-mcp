import { chromium, type BrowserContext, type Page } from 'playwright'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import type { Config } from '../config.js'

export class BrowserSession {
  private context: BrowserContext | null = null
  private page: Page | null = null
  // Internal mutex chain for the download-capturing wrappers. The in-browser
  // dispatcher serializes commands, but the Playwright page-level `download`
  // listener race is on the JS side — two concurrent export tool calls could
  // each see the other's download event. Wrappers acquire this mutex around
  // the action+download-capture pair.
  private downloadMutex: Promise<void> = Promise.resolve()

  constructor(private readonly config: Config) {}

  async start(): Promise<void> {
    if (this.page) return
    await mkdir(dirname(this.config.profileDir), { recursive: true })
    await mkdir(this.config.profileDir, { recursive: true })

    this.context = await chromium.launchPersistentContext(this.config.profileDir, {
      headless: !this.config.headful,
      acceptDownloads: true,
      viewport: { width: 1280, height: 800 }
    })
    this.page = this.context.pages()[0] || await this.context.newPage()
    await this.page.goto(this.config.layersUrl, { waitUntil: 'domcontentloaded' })
    await this.page.waitForFunction(
      () => (window as any).LayersAgent?.ready,
      { timeout: 30_000 }
    )
    await this.page.evaluate(() => (window as any).LayersAgent.ready)
  }

  async evaluate<T>(fn: (...args: any[]) => T | Promise<T>, ...args: any[]): Promise<T> {
    if (!this.page) throw new Error('BrowserSession.start() not called')
    return this.page.evaluate(fn as any, ...args)
  }

  /** Internal: used by tool handlers to invoke an arbitrary LayersAgent command. */
  async runCommand(name: string, args: unknown): Promise<unknown> {
    return this.evaluate(
      ({ n, a }) => (window as any).LayersAgent[n](a),
      { n: name, a: args }
    )
  }

  getPage(): Page {
    if (!this.page) throw new Error('BrowserSession.start() not called')
    return this.page
  }

  /**
   * Serialize executions of `fn` across all callers using a single mutex
   * chain. Used by export tool wrappers so concurrent `tools/call` requests
   * don't race over the page-level download listener.
   */
  async runExclusiveDownload<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.downloadMutex
    let release!: () => void
    this.downloadMutex = new Promise<void>(r => { release = r })
    try {
      await prev
      return await fn()
    } finally {
      release()
    }
  }

  /**
   * Run an action and capture any download triggered by it. Resolves to the
   * absolute path the download was saved to. Returns null if no download fired
   * within timeoutMs.
   *
   * Caller is responsible for serializing concurrent invocations (see
   * `runExclusiveDownload`). The listener is registered with `page.on`, not
   * `page.once`, and explicitly removed in `finally` so a late-arriving
   * download after the timeout fires can't write a stale file.
   */
  async withDownloadCapture<T>(
    outputDir: string,
    action: () => Promise<T>,
    timeoutMs = 120_000
  ): Promise<{ result: T; filePath: string | null }> {
    if (!this.page) throw new Error('BrowserSession.start() not called')
    const page = this.page
    await mkdir(outputDir, { recursive: true })

    let resolveDownload!: (p: string) => void
    let rejectDownload!: (e: any) => void
    const downloadPromise = new Promise<string>((res, rej) => {
      resolveDownload = res
      rejectDownload = rej
    })

    const onDownload = async (download: any) => {
      try {
        const suggested = download.suggestedFilename()
        const dest = join(outputDir, suggested)
        await download.saveAs(dest)
        resolveDownload(dest)
      } catch (e) {
        rejectDownload(e)
      }
    }
    page.on('download', onDownload)

    const timer = setTimeout(() => resolveDownload(''), timeoutMs)

    let result: T
    try {
      result = await action()
      const filePath = await downloadPromise
      return { result, filePath: filePath || null }
    } finally {
      clearTimeout(timer)
      // Always remove the listener — `page.on` doesn't auto-remove and a
      // late-arriving download after the timeout fires would otherwise write
      // a stale file the caller never sees.
      page.off('download', onDownload)
    }
  }

  async shutdown(): Promise<void> {
    if (this.context) {
      await this.context.close()
      this.context = null
      this.page = null
    }
  }
}
