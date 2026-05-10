import type { BrowserSession } from '../harness/browser-session.js'
import { wrapDownloadingTool, DOWNLOADING_COMMANDS } from './exports.js'

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
      description: `LayersAgent.${name} — see https://layers.noisefactor.io for command reference.`,
      inputSchema,
      handler: async (args: unknown) => session.runCommand(name, args ?? {})
    }
    const finalTool = DOWNLOADING_COMMANDS.has(name) && opts?.outputDir
      ? wrapDownloadingTool(baseTool, session, opts.outputDir)
      : baseTool
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
