# layers-mcp

MCP server for the [Layers](https://layers.noisefactor.io) image/video editor.

Brokers between an MCP client (Claude Code, Cursor, Windsurf, etc.) and the
in-page `window.LayersAgent` API. Launches a persistent headless Chromium
session, navigates it at the live Layers app, and exposes every LayersAgent
command as an MCP tool. Tool schemas are pulled from the running page at
startup, so commands added in the `layers` repo surface here with no codegen.

## Architecture

```
┌──────────────┐  stdio  ┌────────────┐  Playwright  ┌────────────────────┐
│  MCP client  │ ──────▶ │ layers-mcp │ ───────────▶ │ headless Chromium  │
│ (Claude etc) │ ◀────── │  (Node)    │ ◀─────────── │  page.evaluate()   │
└──────────────┘ JSON-RPC└────────────┘   downloads  └────────┬───────────┘
                                                              │ HTTPS
                                                              ▼
                                                     layers.noisefactor.io
```

One Chromium context per MCP-server lifetime. Tool handlers call
`page.evaluate(name, args)` against `window.LayersAgent` and return the
LayersAgent envelope (`{ ok, command, result, state }`) verbatim as a text
content block. Export tools also intercept the browser's download event and
splice a local `result.filePath` into the envelope.

## Setup

```bash
npm install
npm run setup    # downloads Playwright Chromium
npm run build
```

Node 18+ required.

## Configuration

All configuration is via environment variables.

| Variable | Default | Description |
|----------|---------|-------------|
| `LAYERS_URL` | `https://layers.noisefactor.io` | URL of the Layers app to drive |
| `LAYERS_MCP_OUTPUT_DIR` | `$PWD/layers-mcp-exports` | Where `exportImage`/`exportVideo` write files |
| `LAYERS_MCP_PROFILE_DIR` | `~/.cache/layers-mcp/profile` | Chromium user-data-dir (preserves saved projects, installed fonts, prefs) |
| `LAYERS_MCP_HEADFUL` | `false` | Set `true` to launch with a visible browser window |
| `LAYERS_MCP_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

## Available Tools

Tools are not hand-coded — at startup the server loads the Layers page, imports
`/js/agent/schemas.js`, enumerates `window.LayersAgent`, and registers one MCP
tool per public command. Today the catalog is roughly 84 tools spanning state
inspection, layer manipulation, drawing, selections, masks, project lifecycle,
auto-corrections, font installation, and image/video export.

To list them at runtime, choose one:

- `LAYERS_URL=<url> npm run smoke` — boots the server and prints the
  `tools/list` JSON-RPC response.
- Send a JSON-RPC `tools/list` request over stdio to `dist/index.js`.
- Read `public/js/agent/index.js` in the `layers` repo, which is the
  authoritative registration list. Per-command input schemas live in
  `public/js/agent/schemas.js`.

Adding a new LayersAgent command in the `layers` repo automatically surfaces
it here on the next MCP-server restart — there is no codegen step in this
repo.

## Client Integration

Replace `/absolute/path/to/layers-mcp/` with the actual checkout path.

### Claude Code

`~/.config/claude-code/mcp.json` (or via `claude mcp add`):

```json
{
  "mcpServers": {
    "layers": {
      "command": "node",
      "args": ["/absolute/path/to/layers-mcp/dist/index.js"],
      "env": {
        "LAYERS_URL": "https://layers.noisefactor.io",
        "LAYERS_MCP_OUTPUT_DIR": "/absolute/path/to/exports"
      }
    }
  }
}
```

A canonical copy of this block lives at `examples/claude-code.json`.

### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "layers": {
      "command": "node",
      "args": ["/absolute/path/to/layers-mcp/dist/index.js"],
      "env": {
        "LAYERS_URL": "https://layers.noisefactor.io",
        "LAYERS_MCP_OUTPUT_DIR": "/absolute/path/to/exports"
      }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "layers": {
      "command": "node",
      "args": ["/absolute/path/to/layers-mcp/dist/index.js"],
      "env": {
        "LAYERS_URL": "https://layers.noisefactor.io",
        "LAYERS_MCP_OUTPUT_DIR": "/absolute/path/to/exports"
      }
    }
  }
}
```

## Testing

Tests run against a Layers instance (local dev server or production). To run
the tests:

1. In another terminal, start a Layers dev server in your layers checkout:
   ```
   npm run dev    # currently: npx http-server public -p 3002 -c-1
   ```
2. In layers-mcp, run vitest with the local URL:
   ```
   LAYERS_URL=http://localhost:3002 npm test
   ```

Once the Layers agent build is deployed to `https://layers.noisefactor.io`,
you can drop the `LAYERS_URL` override and tests run against production.

`npm test` runs `npm run build && vitest run` — the build step is required
because `tests/index.test.ts` spawns `dist/index.js` to exercise the real
stdio JSON-RPC server. If you prefer to skip the build (e.g. when iterating
on a non-stdio test), run `LAYERS_URL=... npx vitest run` directly.

The runtime (production) default for `LAYERS_URL` is `https://layers.noisefactor.io`;
once the Layers agent code is deployed, you can drop the env-var override.

### End-to-end smoke

`scripts/smoke.mjs` (run as `npm run smoke`) boots the built binary, sends a
real `tools/list` and `tools/call` (`getState`), and verifies the responses
are valid MCP envelopes. Useful as a one-shot reproducible check on top of
the vitest suite.

```bash
npm run build
LAYERS_URL=http://localhost:3002 npm run smoke
```

## Development

```bash
npm test          # vitest run
npm run dev       # tsup watch
npm run build     # production build (prepends shebang)
```

## Known Limitations

- **Production deploy pending.** The Layers Phase 1-6 agent code is currently
  local-only; prod `layers.noisefactor.io` does not yet expose
  `window.LayersAgent`. Until that deploy lands, set
  `LAYERS_URL=http://localhost:3002` (or wherever your local dev server runs)
  before starting the MCP server.
- **`exportVideo` cancellation is best-effort.** Mirrors the Layers-side
  limitation: once the video encoder is running, an in-flight cancel may not
  abort cleanly.
- **First `installFontBundle` call downloads ~140 MB** into the headless
  browser. Subsequent calls are cached in the persistent profile. The bundle
  is fetched via in-page `fetch()` into IndexedDB, NOT via the browser's
  download pipeline — layers-mcp blocks the MCP call until the install job
  completes, but does not intercept the download at the network layer, so
  there is no local file produced.
- **`exportImage` with zero downloads.** The export-tool wrappers wait up to
  120 s for a browser download to fire. If the underlying command returns
  successfully but never triggers a download (e.g. an in-progress export was
  cancelled mid-flight), the wrapper will block for the full timeout before
  returning the LayersAgent envelope with `filePath: null`. The mutex
  introduced in Phase 7 prevents concurrent calls from interfering with each
  other, but does not shorten the zero-download case.
- **Browser profile persists across MCP runs.** `LAYERS_MCP_PROFILE_DIR`
  (default `~/.cache/layers-mcp/profile`) keeps saved projects, installed
  fonts, and preferences between sessions. Delete the directory if you want
  a clean slate.

## License

MIT
