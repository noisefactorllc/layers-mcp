// tests/registry.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { BrowserSession } from '../src/harness/browser-session.js'
import { buildToolRegistry } from '../src/tools/registry.js'
import { loadConfig } from '../src/config.js'

const session = new BrowserSession(loadConfig())

beforeAll(async () => { await session.start() }, 60_000)
afterAll(async () => { await session.shutdown() })

describe('buildToolRegistry', () => {
  it('produces one tool per LayersAgent command', async () => {
    const tools = await buildToolRegistry(session)
    const names = tools.map(t => t.name)
    expect(names).toContain('getState')
    expect(names).toContain('addLayer')
    expect(names).toContain('exportImage')
    expect(names).toContain('exportVideo')
    expect(tools.length).toBeGreaterThan(50)
  }, 60_000)

  it('every tool has an inputSchema object', async () => {
    const tools = await buildToolRegistry(session)
    for (const t of tools) {
      expect(t.inputSchema).toBeDefined()
      expect(t.inputSchema.type).toBe('object')
    }
  }, 60_000)

  it('handler invokes the LayersAgent command and returns its envelope', async () => {
    const tools = await buildToolRegistry(session)
    const getStateTool = tools.find(t => t.name === 'getState')!
    const resp = await getStateTool.handler({}) as any
    expect(resp.ok).toBe(true)
    expect(resp.command).toBe('getState')
    expect(resp.state).toBeDefined()
  }, 60_000)
})
