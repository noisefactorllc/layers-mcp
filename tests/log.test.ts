// tests/log.test.ts
//
// Pure unit tests for the leveled stderr logger. No browser/network. Verifies
// the level threshold gates output correctly and that every line is written to
// stderr (console.error) with the shared prefix — the MCP framing on stdout
// depends on logs never leaking there.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createLogger } from '../src/log.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function capture(level: Parameters<typeof createLogger>[0]) {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const log = createLogger(level)
  return { spy, log }
}

describe('createLogger thresholds', () => {
  it('info level shows info/warn/error but not debug', () => {
    const { spy, log } = capture('info')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('error level shows only error', () => {
    const { spy, log } = capture('error')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('warn level shows warn/error only', () => {
    const { spy, log } = capture('warn')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('debug level shows everything', () => {
    const { spy, log } = capture('debug')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(spy).toHaveBeenCalledTimes(4)
  })
})

describe('createLogger output shape', () => {
  it('writes to console.error (stderr) with the [layers-mcp] prefix', () => {
    const { spy, log } = capture('info')
    log.info('hello', 42)
    expect(spy).toHaveBeenCalledWith('[layers-mcp]', 'hello', 42)
  })
})
