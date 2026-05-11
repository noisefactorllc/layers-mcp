/**
 * Tiny leveled stderr logger.
 *
 * MCP servers speak JSON-RPC on stdout — every log line MUST go to stderr or
 * the framing breaks. `LAYERS_MCP_LOG_LEVEL` (`debug` | `info` | `warn` |
 * `error`, default `info`) gates which calls actually write.
 *
 * Ordering: debug < info < warn < error. A level threshold of `info` shows
 * info/warn/error; `error` shows error only; `debug` shows everything.
 */
import type { Config } from './config.js'

export type LogLevel = Config['logLevel']

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
}

const PREFIX = '[layers-mcp]'

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVELS[level]
  const emit = (lineLevel: number, ...args: unknown[]) => {
    if (lineLevel < threshold) return
    // eslint-disable-next-line no-console -- intentional stderr write
    console.error(PREFIX, ...args)
  }
  return {
    debug: (...args) => emit(LEVELS.debug, ...args),
    info: (...args) => emit(LEVELS.info, ...args),
    warn: (...args) => emit(LEVELS.warn, ...args),
    error: (...args) => emit(LEVELS.error, ...args)
  }
}
