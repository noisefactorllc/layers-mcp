import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserSession } from '../src/harness/browser-session.js'
import { buildToolRegistry } from '../src/tools/registry.js'
import { loadConfig } from '../src/config.js'

const outDir = mkdtempSync(join(tmpdir(), 'layers-mcp-jobs-'))
const config = { ...loadConfig(), outputDir: outDir }
const session = new BrowserSession(config)

beforeAll(async () => { await session.start() }, 60_000)
afterAll(async () => { await session.shutdown() })

describe('exportVideo as a synchronous MCP tool', () => {
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
