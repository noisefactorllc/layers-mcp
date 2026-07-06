// tests/browser-session.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import { BrowserSession } from '../src/harness/browser-session.js'
import { INTEGRATION_AVAILABLE } from './setup.js'
import { makeTestConfig } from './helpers.js'

const session = new BrowserSession(makeTestConfig('layers-mcp-browser'))

afterAll(async () => {
  if (!INTEGRATION_AVAILABLE) return
  await session.shutdown()
})

describe.skipIf(!INTEGRATION_AVAILABLE)('BrowserSession (real Playwright, real prod)', () => {
  it('launches, navigates, and awaits LayersAgent.ready', async () => {
    await session.start()
    const version = await session.evaluate<string>(() =>
      (window as any).LayersAgent.version
    )
    expect(typeof version).toBe('string')
    expect(version.length).toBeGreaterThan(0)
  }, 60_000)

  it('exposes a list of registered LayersAgent commands', async () => {
    const commands = await session.evaluate<string[]>(() =>
      Object.keys((window as any).LayersAgent).filter(k =>
        typeof (window as any).LayersAgent[k] === 'function'
      )
    )
    expect(commands.length).toBeGreaterThan(50)
    expect(commands).toContain('getState')
    expect(commands).toContain('exportImage')
  }, 60_000)
})
