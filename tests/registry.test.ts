// tests/registry.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { BrowserSession } from '../src/harness/browser-session.js'
import { buildToolRegistry, type ToolDef } from '../src/tools/registry.js'
import { loadConfig } from '../src/config.js'
import { INTEGRATION_AVAILABLE } from './setup.js'

const session = new BrowserSession(loadConfig())
// Built once in beforeAll and shared across tests — the registry build
// involves a full page.evaluate to import schemas.js, so rebuilding it per
// test is wasteful when the page state doesn't change between assertions.
let tools: ToolDef[]

beforeAll(async () => {
  if (!INTEGRATION_AVAILABLE) return
  await session.start()
  tools = await buildToolRegistry(session)
}, 60_000)
afterAll(async () => {
  if (!INTEGRATION_AVAILABLE) return
  await session.shutdown()
})

describe.skipIf(!INTEGRATION_AVAILABLE)('buildToolRegistry', () => {
  it('produces one tool per LayersAgent command', () => {
    const names = tools.map(t => t.name)
    expect(names).toContain('getState')
    expect(names).toContain('addLayer')
    expect(names).toContain('exportImage')
    expect(names).toContain('exportVideo')
    expect(tools.length).toBeGreaterThan(50)
  })

  it('every tool has an inputSchema object', () => {
    for (const t of tools) {
      expect(t.inputSchema).toBeDefined()
      expect(t.inputSchema.type).toBe('object')
    }
  })

  it('handler invokes the LayersAgent command and returns its envelope', async () => {
    const getStateTool = tools.find(t => t.name === 'getState')!
    const resp = await getStateTool.handler({}) as any
    expect(resp.ok).toBe(true)
    expect(resp.command).toBe('getState')
    expect(resp.state).toBeDefined()
  }, 60_000)
})
