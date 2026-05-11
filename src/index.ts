/**
 * layers-mcp — MCP server fronting window.LayersAgent in a headless browser.
 * See README.md for architecture.
 *
 * Note: shebang is prepended at build-time by the package.json `postbuild`
 * script (mirroring shade-mcp). Keeping it out of source avoids a double
 * shebang in dist/index.js, which Node rejects as a syntax error.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { loadConfig } from './config.js'
import { createLogger } from './log.js'
import { BrowserSession } from './harness/browser-session.js'
import { buildToolRegistry, type ToolDef } from './tools/index.js'

async function main() {
  const config = loadConfig()
  const log = createLogger(config.logLevel)
  const session = new BrowserSession(config)

  log.info('starting browser harness…')
  await session.start()
  log.info('harness ready')

  const tools = await buildToolRegistry(session, { outputDir: config.outputDir })
  const toolByName = new Map<string, ToolDef>(tools.map(t => [t.name, t]))
  log.info(`registered ${tools.length} tools`)

  const server = new Server(
    { name: 'layers-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    const tool = toolByName.get(name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` } }) }],
        isError: true
      }
    }
    try {
      const result = await tool.handler(args ?? {})
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: !(result as any)?.ok
      }
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          ok: false,
          error: { code: 'HANDLER_THREW', message: err?.message || String(err) }
        })}],
        isError: true
      }
    }
  })

  const transport = new StdioServerTransport()

  // Clean shutdown
  const shutdown = async () => {
    try { await session.shutdown() } catch {}
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await server.connect(transport)
  // NOTE: this exact string ('connected; targeting …') is the boot-readiness
  // sentinel that `tests/index.test.ts` and `scripts/smoke.mjs` poll for over
  // the child's stderr. Don't reword it without updating both. The line is
  // emitted at `info` level — `LAYERS_MCP_LOG_LEVEL=warn` and above would
  // suppress it, which is fine for production but breaks the test harness.
  log.info(`connected; targeting ${config.layersUrl}`)
}

main().catch((err) => {
  // Fatal errors always go to stderr, regardless of LOG_LEVEL — we want the
  // crash surfaced even with LAYERS_MCP_LOG_LEVEL=error suppressed elsewhere.
  console.error('[layers-mcp] fatal:', err)
  process.exit(1)
})
