import { chromium, type BrowserContext, type Page } from 'playwright'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import type { Config } from '../config.js'
import { createLogger, type Logger } from '../log.js'
import { uniqueDownloadPath, releaseDownloadPath } from './download-path.js'

export class BrowserSession {
  private context: BrowserContext | null = null
  private page: Page | null = null
  // Internal mutex chain for the download-capturing wrappers. The in-browser
  // dispatcher serializes commands, but the Playwright page-level `download`
  // listener race is on the JS side — two concurrent export tool calls could
  // each see the other's download event. Wrappers acquire this mutex around
  // the action+download-capture pair.
  private downloadMutex: Promise<void> = Promise.resolve()
  private readonly log: Logger

  constructor(private readonly config: Config) {
    this.log = createLogger(config.logLevel)
  }

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

  /**
   * Best-effort check whether the underlying page is still usable. Used by
   * crash-recovery code to detect Chromium dying (OOM, segfault, driver
   * desync) before issuing the next command. Never throws.
   */
  async isAlive(): Promise<boolean> {
    if (!this.page) return false
    try {
      await this.page.evaluate('1')
      return true
    } catch {
      return false
    }
  }

  /**
   * Tear the current browser context down and bring up a fresh one. Used as
   * the recovery primitive when `withRetry` detects a Playwright crash
   * signature. Resets the mutex chain as well — anything that was queued
   * against the dead page can never settle.
   */
  async restart(): Promise<void> {
    await this.shutdown()
    this.downloadMutex = Promise.resolve()
    await this.start()
  }

  /**
   * Wrap an arbitrary page-level operation so that a single browser-crash
   * Playwright error triggers `restart()` and a single retry. Intentionally
   * NOT applied to `start()` / `shutdown()` themselves — they are the
   * recovery primitives.
   *
   * Crash signatures we recognize (per Playwright source):
   *   - Target page, context or browser has been closed
   *   - Target closed
   *   - Page crashed
   *   - Browser has been closed
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err: any) {
      const msg = err?.message || String(err)
      const isBrowserCrash =
        msg.includes('Target page, context or browser has been closed') ||
        msg.includes('Target closed') ||
        msg.includes('Page crashed') ||
        msg.includes('Browser has been closed')
      if (!isBrowserCrash) throw err
      this.log.warn('browser crash detected, restarting…', msg)
      await this.restart()
      return fn()
    }
  }

  /**
   * Evaluate a function in the page context.
   *
   * Mirrors Playwright's `page.evaluate(fn, arg)` contract: zero args or
   * exactly one argument (packed into an object when multiple values are
   * needed — see `runCommand` for the canonical pattern).
   */
  async evaluate<T, A = void>(
    fn: ((arg: A) => T | Promise<T>) | string,
    arg?: A
  ): Promise<T> {
    if (!this.page) throw new Error('BrowserSession.start() not called')
    return this.withRetry(() =>
      arg === undefined
        ? this.page!.evaluate(fn as any)
        : this.page!.evaluate(fn as any, arg)
    )
  }

  /** Internal: used by tool handlers to invoke an arbitrary LayersAgent command. */
  async runCommand(name: string, args: unknown): Promise<unknown> {
    return this.withRetry(() => this.page!.evaluate(
      ({ n, a }) => (window as any).LayersAgent[n](a),
      { n: name, a: args }
    ))
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
   *
   * Crash handling has a subtlety. The `action()` usually routes through
   * `runCommand`, whose own `withRetry` catches a browser crash, calls
   * `restart()`, and re-runs the command on a fresh page — so the crash is
   * absorbed *inside* `action()` and never reaches this method's own
   * `withRetry`. When that happens the fresh page is a different object than
   * the `page` we bound the download listener to, the real download fired on
   * the new page with no listener attached, and it can never arrive here. We
   * detect that page swap once `action()` resolves and short-circuit instead
   * of stalling for the full timeout — keeping an already-saved file if the
   * download finished before the crash, otherwise returning `filePath: null`.
   * (If a crash *does* escape `action()`, this method's `withRetry` restarts
   * and re-runs the whole capture — listener and all — against the new page.)
   *
   * `shouldWait` lets callers short-circuit the download wait based on
   * action's return value — used by job wrappers to skip the 120 s wait
   * when the kickoff envelope is itself an error (no download will fire).
   * Defaults to always-wait, preserving the synchronous-export contract.
   */
  async withDownloadCapture<T>(
    outputDir: string,
    action: () => Promise<T>,
    timeoutMs = 120_000,
    shouldWait: (result: T) => boolean = () => true
  ): Promise<{ result: T; filePath: string | null }> {
    if (!this.page) throw new Error('BrowserSession.start() not called')
    await mkdir(outputDir, { recursive: true })

    return this.withRetry(async () => {
      const page = this.page!
      let resolveDownload!: (p: string) => void
      let rejectDownload!: (e: any) => void
      const downloadPromise = new Promise<string>((res, rej) => {
        resolveDownload = res
        rejectDownload = rej
      })

      // Set once a download has been fully saved, so the page-swap guard
      // below can distinguish a real, already-captured file from a download
      // that never arrived.
      let capturedPath: string | null = null
      const onDownload = async (download: any) => {
        let dest: string | null = null
        try {
          // Never `join(outputDir, suggested)` directly: the name is page-
          // supplied, so it can escape the directory, and saveAs overwrites,
          // so it can destroy a previous export. The resolver reserves the
          // name it hands back, which is also what keeps two downloads fired
          // inside one capture window from landing on the same path.
          dest = await uniqueDownloadPath(outputDir, download.suggestedFilename())
          await download.saveAs(dest)
          capturedPath = dest
          resolveDownload(dest)
        } catch (e) {
          // Don't leave the empty reservation behind if the save failed.
          if (dest) await releaseDownloadPath(dest)
          rejectDownload(e)
        }
      }
      page.on('download', onDownload)

      const timer = setTimeout(() => resolveDownload(''), timeoutMs)

      let result: T
      try {
        result = await action()
        if (!shouldWait(result)) {
          return { result, filePath: null }
        }
        // Crash-recovery inside action() (the inner runCommand's withRetry)
        // can swap `this.page` out from under us. The listener above is bound
        // to the now-dead `page`, so a download that hadn't fired yet will
        // never resolve `downloadPromise`. Bail now rather than burning the
        // full timeout on a download that can't arrive — unless the download
        // had already completed on the original page before it crashed, in
        // which case `capturedPath` holds the saved file and we keep it.
        if (this.page !== page) {
          if (capturedPath) {
            return { result, filePath: capturedPath }
          }
          this.log.warn(
            'page restarted mid-export; download not captured ' +
            '(re-run the export to retrieve the file)'
          )
          return { result, filePath: null }
        }
        const filePath = await downloadPromise
        return { result, filePath: filePath || null }
      } finally {
        clearTimeout(timer)
        // Always remove the listener — `page.on` doesn't auto-remove and a
        // late-arriving download after the timeout fires would otherwise write
        // a stale file the caller never sees.
        page.off('download', onDownload)
      }
    })
  }

  async shutdown(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close()
      } catch {
        // Already-dead contexts (post-crash) throw on close — swallow so we
        // can still null out state and bring up a fresh context.
      }
      this.context = null
      this.page = null
    }
  }
}
