// tests/config.test.ts
//
// Pure unit tests for loadConfig — no browser, no LAYERS_URL, no network.
// These run in CI where the integration suites (gated on INTEGRATION_AVAILABLE)
// are skipped, so they're the layer that actually exercises config parsing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { loadConfig } from '../src/config.js'

// loadConfig reads process.env directly. Snapshot and clear the keys it looks
// at before each test so the host environment (which may set LAYERS_URL when
// running the integration suite) can't leak into these assertions.
const KEYS = [
  'LAYERS_URL',
  'LAYERS_MCP_OUTPUT_DIR',
  'LAYERS_MCP_PROFILE_DIR',
  'LAYERS_MCP_HEADFUL',
  'LAYERS_MCP_LOG_LEVEL'
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('loadConfig defaults', () => {
  it('falls back to documented defaults when nothing is set', () => {
    const c = loadConfig()
    expect(c.layersUrl).toBe('https://layers.noisefactor.io')
    expect(c.outputDir).toBe(join(process.cwd(), 'layers-mcp-exports'))
    expect(c.profileDir).toBe(join(homedir(), '.cache', 'layers-mcp', 'profile'))
    expect(c.headful).toBe(false)
    expect(c.logLevel).toBe('info')
  })
})

describe('loadConfig overrides', () => {
  it('honors every environment override', () => {
    process.env.LAYERS_URL = 'http://localhost:3002'
    process.env.LAYERS_MCP_OUTPUT_DIR = '/tmp/out'
    process.env.LAYERS_MCP_PROFILE_DIR = '/tmp/profile'
    process.env.LAYERS_MCP_HEADFUL = 'true'
    process.env.LAYERS_MCP_LOG_LEVEL = 'debug'
    const c = loadConfig()
    expect(c.layersUrl).toBe('http://localhost:3002')
    expect(c.outputDir).toBe('/tmp/out')
    expect(c.profileDir).toBe('/tmp/profile')
    expect(c.headful).toBe(true)
    expect(c.logLevel).toBe('debug')
  })

  it('treats LAYERS_MCP_HEADFUL as an exact "true" match', () => {
    // Documented contract is strict equality with 'true'. Anything else
    // (including 'TRUE', '1', ' true') means headless.
    for (const v of ['false', 'TRUE', '1', ' true', '']) {
      process.env.LAYERS_MCP_HEADFUL = v
      expect(loadConfig().headful).toBe(false)
    }
    process.env.LAYERS_MCP_HEADFUL = 'true'
    expect(loadConfig().headful).toBe(true)
  })

  it('accepts all four valid log levels', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      process.env.LAYERS_MCP_LOG_LEVEL = level
      expect(loadConfig().logLevel).toBe(level)
    }
  })
})

describe('loadConfig validation', () => {
  it('throws on an unrecognized log level', () => {
    process.env.LAYERS_MCP_LOG_LEVEL = 'loud'
    expect(() => loadConfig()).toThrow(/must be debug\|info\|warn\|error/)
  })
})
