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
import { loadConfig } from './config.js'

async function main() {
  const config = loadConfig()
  const server = new Server(
    { name: 'layers-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )
  // T2 will attach the harness here.
  // T6 will register tools here.

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Log to stderr so it doesn't corrupt the MCP stdio protocol.
  console.error(`[layers-mcp] connected; targeting ${config.layersUrl}`)
}

main().catch((err) => {
  console.error('[layers-mcp] fatal:', err)
  process.exit(1)
})
