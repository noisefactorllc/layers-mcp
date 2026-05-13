import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, statSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserSession } from '../src/harness/browser-session.js'
import { buildToolRegistry } from '../src/tools/registry.js'
import { loadConfig } from '../src/config.js'
import { INTEGRATION_AVAILABLE } from './setup.js'

const outDir = mkdtempSync(join(tmpdir(), 'layers-mcp-test-'))
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

describe.skipIf(!INTEGRATION_AVAILABLE)('export-tool download interception', () => {
  it('exportImage writes a PNG to outputDir and returns filePath', async () => {
    const tools = await buildToolRegistry(session, { outputDir: config.outputDir })
    const tool = tools.find(t => t.name === 'exportImage')!
    const resp = await tool.handler({ format: 'png' }) as any
    expect(resp.ok).toBe(true)
    expect(typeof resp.result.filePath).toBe('string')
    expect(existsSync(resp.result.filePath)).toBe(true)
    expect(statSync(resp.result.filePath).size).toBeGreaterThan(100)
    expect(resp.result.filePath.startsWith(outDir)).toBe(true)
  }, 60_000)

  it('two parallel exportImage calls each capture their own file', async () => {
    const tools = await buildToolRegistry(session, { outputDir: config.outputDir })
    const tool = tools.find(t => t.name === 'exportImage')!
    const [r1, r2] = await Promise.all([
      tool.handler({ format: 'png', filename: 'one' }),
      tool.handler({ format: 'png', filename: 'two' })
    ]) as any[]
    expect(r1.ok && r2.ok).toBe(true)
    expect(typeof r1.result.filePath).toBe('string')
    expect(typeof r2.result.filePath).toBe('string')
    expect(r1.result.filePath).not.toBe(r2.result.filePath)
    expect(existsSync(r1.result.filePath)).toBe(true)
    expect(existsSync(r2.result.filePath)).toBe(true)
  }, 60_000)
})
