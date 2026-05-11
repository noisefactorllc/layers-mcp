import type { BrowserSession } from '../harness/browser-session.js'
import {
  wrapDownloadingTool,
  DOWNLOADING_COMMANDS,
  wrapJobTool,
  wrapBlockingJobTool
} from './exports.js'
import { describeCommand } from './descriptions.js'

// LayersAgent command categories that need special MCP-side wrapping:
//   - DOWNLOADING_COMMANDS: synchronous commands that trigger a browser
//     download as a side effect (e.g. `exportImage`).
//   - DOWNLOAD_JOB_COMMANDS: job-modeled commands that return `{jobId}`
//     immediately AND fire a browser download when the job settles
//     (e.g. `exportVideo`).
//   - BLOCKING_JOB_COMMANDS: job-modeled commands that return `{jobId}`
//     immediately but do NOT use the browser's download pipeline
//     (e.g. `installFontBundle`, which pulls into IndexedDB via fetch).
//
// Everything else is a synchronous pass-through.
const DOWNLOAD_JOB_COMMANDS = new Set(['exportVideo'])
const BLOCKING_JOB_COMMANDS = new Set(['installFontBundle'])

export interface ToolDef {
  name: string
  description: string
  inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean }
  handler: (args: unknown) => Promise<unknown>
}

export interface RegistryOptions { outputDir: string }

/**
 * Pull the live schema map and command names from the loaded Layers page,
 * then synthesize one MCP tool definition per command.
 *
 * Skips test/diagnostic commands prefixed with `_` (they're internal).
 *
 * Implementation note: the in-page snippet is passed to Playwright as a
 * literal string (not a TS-source function). This bypasses Vitest's SSR
 * transformer, which would otherwise rewrite `import(...)` to its internal
 * `__vite_ssr_dynamic_import__` helper — a name that doesn't exist in the
 * browser. Playwright's `page.evaluate(stringExpression)` form is part of
 * its documented API.
 */
export async function buildToolRegistry(
  session: BrowserSession,
  opts?: Partial<RegistryOptions>
): Promise<ToolDef[]> {
  const page = session.getPage()
  const { commandNames, schemas } = await page.evaluate(`(async () => {
    const agent = window.LayersAgent
    const m = await import('/js/agent/schemas.js')
    const commandNames = Object.keys(agent).filter(k =>
      typeof agent[k] === 'function' && !k.startsWith('_')
    )
    return { commandNames, schemas: m.SCHEMAS || {} }
  })()`) as { commandNames: string[]; schemas: Record<string, any> }

  const tools: ToolDef[] = []
  for (const name of commandNames) {
    const raw = schemas[name]
    const inputSchema = normalizeSchema(raw)
    const baseTool: ToolDef = {
      name,
      description: describeCommand(name),
      inputSchema,
      handler: async (args: unknown) => session.runCommand(name, args ?? {})
    }
    let finalTool = baseTool
    if (opts?.outputDir) {
      if (DOWNLOADING_COMMANDS.has(name)) {
        finalTool = wrapDownloadingTool(baseTool, session, opts.outputDir)
      } else if (DOWNLOAD_JOB_COMMANDS.has(name)) {
        finalTool = wrapJobTool(baseTool, session, opts.outputDir)
      } else if (BLOCKING_JOB_COMMANDS.has(name)) {
        finalTool = wrapBlockingJobTool(baseTool, session)
      }
    }
    tools.push(finalTool)
  }
  return tools
}

function normalizeSchema(raw: unknown): ToolDef['inputSchema'] {
  if (!raw || typeof raw !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: false }
  }
  const s = raw as any
  if (s.type === 'object') {
    return {
      type: 'object',
      properties: s.properties || {},
      required: Array.isArray(s.required) ? s.required : undefined,
      additionalProperties: typeof s.additionalProperties === 'boolean'
        ? s.additionalProperties
        : false
    }
  }
  return { type: 'object', properties: {}, additionalProperties: false }
}
