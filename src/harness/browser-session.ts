import { chromium, type BrowserContext, type Page } from 'playwright'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Config } from '../config.js'

export class BrowserSession {
  private context: BrowserContext | null = null
  private page: Page | null = null

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

  async shutdown(): Promise<void> {
    if (this.context) {
      await this.context.close()
      this.context = null
      this.page = null
    }
  }
}
