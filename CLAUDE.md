# layers-mcp

MCP server fronting `window.LayersAgent` in a headless browser. TypeScript,
ESM only, Node 18+. Stack mirrors `../shade-mcp/`: tsup + vitest +
`@modelcontextprotocol/sdk` over stdio.

## Architecture decisions

- **Connects to a remote Layers app.** `LAYERS_URL` (default
  `https://layers.noisefactor.io`) selects which deployment to drive.
  layers-mcp does NOT serve the Layers app locally — point it at a running
  Layers instance (prod or a local dev server).
- **Schema-driven tool registry.** At startup, the harness loads the page,
  awaits `LayersAgent.ready`, imports `/js/agent/schemas.js`, and enumerates
  `window.LayersAgent` keys. One MCP tool is registered per public command
  using the live schema as `inputSchema`. Adding a new LayersAgent command
  in the `layers` repo automatically surfaces it here on the next MCP-server
  restart — there is no codegen step in this repo.
- **Persistent Chromium profile.** `LAYERS_MCP_PROFILE_DIR`
  (default `~/.cache/layers-mcp/profile`) is the Playwright user-data-dir.
  The user's saved projects, installed fonts, and app preferences carry
  across MCP sessions. Delete the directory for a clean state.
- **One context per MCP-server lifetime.** Single persistent Chromium
  context; all tool calls hit the same page. Tool handlers do
  `page.evaluate((n,a) => window.LayersAgent[n](a), name, args)` and return
  the LayersAgent envelope verbatim — `{ ok, command, result, state }` —
  so clients get a full state snapshot on every response.
- **Export tools intercept downloads.** `exportImage` and `exportVideo` wire
  a Playwright `page.on('download')` handler that saves the blob to
  `LAYERS_MCP_OUTPUT_DIR` and splices a local `filePath` into the envelope.
- **`exportVideo` synchronously awaits the job.** The underlying LayersAgent
  command is job-modeled (returns `{ jobId }` immediately). The MCP tool
  wraps that with `waitForJob` so callers get the final job result and
  `filePath` in one round trip.

## Build behavior

- `dist/` is gitignored. Consumers cloning the repo get the build
  automatically because `package.json` defines `"prepare": "npm run build"`,
  which npm runs after `npm install`. This is intentional convenience; if
  you ever publish to npm, switch `prepare` to `prepublishOnly` so it only
  fires on publish (not on consumer installs).

## When extending

- Mirror `../shade-mcp/`'s file layout (`src/harness/`, `src/tools/`,
  `tests/` next to `src/`). Same TS/tsup/vitest setup.
- Don't hand-write tool definitions. New commands belong in the `layers`
  repo's `public/js/agent/`; they appear here automatically.
- Tests run against a real Layers app. `tests/setup.ts` asserts
  `LAYERS_URL` is reachable and bails fast if it isn't. Run with
  `LAYERS_URL=http://localhost:3002 npx vitest run` while prod is unpushed.
- `scripts/smoke.mjs` (`npm run smoke`) exercises the built binary via
  real stdio JSON-RPC. Run it after any change to `src/index.ts` or
  the registry.

## Ground rules

Defer to `~/platform/CLAUDE.md` for workspace-wide rules. Notable items
that apply here:

- No committing or pushing untested code.
- No committing private info (API keys, internal URLs, personal paths)
  to public repos. Use placeholders in example configs.
- No temporary/ephemeral/placeholder solutions. If it won't survive a
  reboot, it doesn't ship.
- No squashing already-pushed commits; no force-push.
