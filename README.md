# layers-mcp

MCP server for the [Layers](https://layers.noisefactor.io) image/video editor.

Brokers between MCP clients (Claude Code, Cursor, etc.) and the in-page
`window.LayersAgent` API. Launches headless Chromium, drives Layers as a
human would, exposes every LayersAgent command as an MCP tool.

Detailed documentation in Task 8.
