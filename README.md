# layers-mcp

MCP server for the [Layers](https://layers.noisefactor.io) image/video editor.

Brokers between MCP clients (Claude Code, Cursor, etc.) and the in-page
`window.LayersAgent` API. Launches headless Chromium, drives Layers as a
human would, exposes every LayersAgent command as an MCP tool.

Detailed documentation in Task 8.

## Testing

Phase 7 tests run against a local layers dev server while the layers Phase 1-6
work is unpushed. To run the tests:

1. In another terminal, start the layers dev server:
   ```
   cd /Users/aayars/platform/layers
   npm run dev    # currently: npx http-server public -p 3002 -c-1
   ```
2. In layers-mcp, run vitest with the local URL:
   ```
   LAYERS_URL=http://localhost:3002 npx vitest run
   ```

The runtime (production) default for `LAYERS_URL` is `https://layers.noisefactor.io`;
once the layers agent code is deployed, you can drop the env-var override.
