// tests/negative-paths.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserSession } from '../src/harness/browser-session.js'
import { buildToolRegistry } from '../src/tools/registry.js'
import { loadConfig } from '../src/config.js'

const outDir = mkdtempSync(join(tmpdir(), 'layers-mcp-neg-'))
const config = { ...loadConfig(), outputDir: outDir }
const session = new BrowserSession(config)

beforeAll(async () => { await session.start() }, 60_000)
afterAll(async () => { await session.shutdown() })

describe('layers-mcp negative paths', () => {
  it('exportVideo with out-of-range duration returns INVALID_ARGS_RANGE', async () => {
    const tools = await buildToolRegistry(session, { outputDir: config.outputDir })
    const tool = tools.find(t => t.name === 'exportVideo')!
    const resp = await tool.handler({
      width: 64, height: 64, framerate: 30,
      duration: 1000,    // schema max is 300
      format: 'zip', quality: 'low'
    }) as any
    expect(resp.ok).toBe(false)
    expect(resp.error?.code).toBe('INVALID_ARGS_RANGE')
  }, 30_000)

  it('exportVideo with unknown format returns INVALID_ARGS_ENUM', async () => {
    const tools = await buildToolRegistry(session, { outputDir: config.outputDir })
    const tool = tools.find(t => t.name === 'exportVideo')!
    const resp = await tool.handler({
      width: 64, height: 64, framerate: 30, duration: 0.1,
      format: 'gif',     // schema enum is ['mp4', 'zip']
      quality: 'low'
    }) as any
    expect(resp.ok).toBe(false)
    expect(resp.error?.code).toBe('INVALID_ARGS_ENUM')
  }, 30_000)

  it('BrowserSession.runCommand auto-recovers after page crash', async () => {
    // Force-close the page out from under the session. The next call must
    // see a Playwright "Target closed" error, trigger withRetry's restart()
    // path, and succeed on the retry against a fresh page.
    await session.getPage().close()
    expect(await session.isAlive()).toBe(false)

    const resp = await session.runCommand('getState', {}) as any

    expect(resp.ok).toBe(true)
    expect(resp.command).toBe('getState')
    expect(resp.state).toBeDefined()
    // Sanity: session is back to alive state after recovery.
    expect(await session.isAlive()).toBe(true)
  }, 90_000)
})
