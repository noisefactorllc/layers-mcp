import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserSession } from '../src/harness/browser-session.js'
import { buildToolRegistry } from '../src/tools/registry.js'
import { loadConfig } from '../src/config.js'
import { INTEGRATION_AVAILABLE } from './setup.js'

const outDir = mkdtempSync(join(tmpdir(), 'layers-mcp-jobs-'))
const config = { ...loadConfig(), outputDir: outDir }
const session = new BrowserSession(config)

beforeAll(async () => {
  if (!INTEGRATION_AVAILABLE) return
  await session.start()
}, 60_000)
afterAll(async () => {
  if (!INTEGRATION_AVAILABLE) return
  await session.shutdown()
})

describe.skipIf(!INTEGRATION_AVAILABLE)('exportVideo as a synchronous MCP tool', () => {
  it('returns the final job result + filePath when video finishes', async () => {
    const tools = await buildToolRegistry(session, { outputDir: config.outputDir })
    const tool = tools.find(t => t.name === 'exportVideo')!
    const resp = await tool.handler({
      width: 64, height: 64, framerate: 30, duration: 0.1,
      format: 'zip', quality: 'low'
    }) as any
    // resp = waitForJob envelope: { ok, command, result: <jobState>, state }
    // jobState.result is the nested job-callback return; filePath is spliced into it.
    expect(resp.ok).toBe(true)
    expect(resp.result.status).toBe('succeeded')
    expect(typeof resp.result.result.filePath).toBe('string')
    expect(existsSync(resp.result.result.filePath)).toBe(true)
  }, 120_000)
})

describe.skipIf(!INTEGRATION_AVAILABLE)('installFontBundle as a blocking MCP tool', () => {
  it('blocks the MCP call until the install job settles', async () => {
    // Stub the in-page fontaine loader to skip the 140 MB real download. The
    // loader is a module-level singleton — dynamic-importing the module from
    // here returns the same instance commands.js holds. We use a literal
    // string passed to page.evaluate (mirroring registry.ts) to bypass
    // Vitest's SSR rewrite of `import(...)`.
    const page = session.getPage()
    await page.evaluate(`(async () => {
      const m = await import('/js/layers/fontaine-loader.js')
      const loader = m.getFontaineLoader()
      loader.install = async ({ onProgress }) => {
        onProgress(0, 'Loading manifest...')
        onProgress(50, 'Downloading: 70 / 140 MB')
        onProgress(100, 'Installed 100 fonts')
        loader.installedVersion = 'test-1'
        loader.catalog = { fonts: [{ id: 'a', name: 'A' }] }
        loader.fontsLoaded = true
        return true
      }
      loader.isInstalled = async () => true
    })()`)

    const tools = await buildToolRegistry(session, { outputDir: config.outputDir })
    const tool = tools.find(t => t.name === 'installFontBundle')!

    const resp = await tool.handler({}) as any

    // The wrapper must return the settled waitForJob envelope — not the
    // {jobId} kickoff envelope, which lacks `result.status`. The job
    // callback return value lands at resp.result.result.
    expect(resp.ok).toBe(true)
    expect(resp.result.status).toBe('succeeded')
    expect(resp.result.result.count).toBe(1)
  }, 30_000)
})
