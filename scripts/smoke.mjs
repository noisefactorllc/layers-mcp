#!/usr/bin/env node
/**
 * scripts/smoke.mjs — built-binary JSON-RPC smoke for layers-mcp.
 *
 * Boots `dist/index.js` over stdio, sends a real `tools/list` and
 * `tools/call` (getState), and verifies the responses are valid MCP
 * envelopes. Exists as a one-shot reproducible check on top of
 * tests/index.test.ts (which only covers tools/list).
 *
 * Usage:
 *   LAYERS_URL=http://localhost:3002 node scripts/smoke.mjs
 *
 * Requires the Layers dev server to be reachable at LAYERS_URL.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist/index.js')

function log(msg) {
  console.log(`[smoke] ${msg}`)
}

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`)
  process.exitCode = 1
}

if (!existsSync(DIST)) {
  console.error(`[smoke] dist/index.js missing at ${DIST}.`)
  console.error(`[smoke] Run \`npm run build\` first, then re-run \`npm run smoke\`.`)
  process.exit(2)
}

if (!process.env.LAYERS_URL) {
  console.error('[smoke] LAYERS_URL is required.')
  console.error('[smoke] Start the layers dev server (`npm run dev` in /Users/aayars/platform/layers/)')
  console.error('[smoke] and re-run with LAYERS_URL=http://localhost:3002 npm run smoke')
  process.exit(2)
}

const child = spawn('node', [DIST], {
  cwd: ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
})

let exited = false
const cleanup = () => {
  if (!exited && !child.killed) {
    try { child.kill('SIGKILL') } catch {}
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })
child.on('exit', () => { exited = true })

// Mirror the stdout buffering pattern from tests/index.test.ts.
// Collect framed JSON-RPC lines and resolve pending requests by id.
const pending = new Map()
let stdoutBuf = ''
child.stdout.on('data', (chunk) => {
  stdoutBuf += chunk.toString()
  const lines = stdoutBuf.split('\n')
  stdoutBuf = lines.pop() || ''
  for (const line of lines) {
    if (!line.trim()) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id)
      pending.delete(msg.id)
      resolve(msg)
    }
  }
})

let stderrBuf = ''
child.stderr.on('data', (chunk) => {
  stderrBuf += chunk.toString()
  // Forward harness stderr so the user sees boot progress.
  process.stderr.write(`[mcp-stderr] ${chunk}`)
})

function rpc(id, method, params) {
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`rpc ${id} (${method}) timed out`))
      }
    }, 90_000)
  })
}

function waitForReady(timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const check = () => {
      if (stderrBuf.includes('connected; targeting')) return resolve()
      if (exited) return reject(new Error('child exited before becoming ready'))
      if (Date.now() > deadline) return reject(new Error('boot timeout'))
      setTimeout(check, 100)
    }
    check()
  })
}

async function main() {
  log(`spawning ${DIST}`)
  log(`LAYERS_URL=${process.env.LAYERS_URL}`)

  log('waiting for harness boot…')
  await waitForReady(60_000)
  log('harness ready')

  // --- tools/list ---
  log('sending tools/list…')
  const listResp = await rpc(1, 'tools/list', {})
  if (!listResp.result || !Array.isArray(listResp.result.tools)) {
    fail(`tools/list missing result.tools: ${JSON.stringify(listResp).slice(0, 200)}`)
    return
  }
  const names = listResp.result.tools.map((t) => t.name)
  log(`tools/list returned ${names.length} tools`)
  if (!names.includes('getState')) {
    fail(`tools/list missing getState; got ${names.slice(0, 10).join(',')}…`)
    return
  }
  log('  [pass] tools/list includes getState')

  // --- tools/call getState ---
  log('sending tools/call getState…')
  const callResp = await rpc(2, 'tools/call', { name: 'getState', arguments: {} })
  if (!callResp.result || !Array.isArray(callResp.result.content)) {
    fail(`tools/call missing result.content: ${JSON.stringify(callResp).slice(0, 200)}`)
    return
  }
  const textBlock = callResp.result.content.find((c) => c.type === 'text')
  if (!textBlock) {
    fail(`tools/call has no text content block`)
    return
  }
  let envelope
  try { envelope = JSON.parse(textBlock.text) } catch (e) {
    fail(`tools/call text content not JSON: ${e.message}`)
    return
  }
  if (envelope.ok !== true) {
    fail(`envelope.ok !== true: ${JSON.stringify(envelope).slice(0, 200)}`)
    return
  }
  if (envelope.command !== 'getState') {
    fail(`envelope.command !== 'getState': got ${envelope.command}`)
    return
  }
  if (!envelope.state || typeof envelope.state !== 'object') {
    fail(`envelope.state missing or not object: ${JSON.stringify(envelope).slice(0, 200)}`)
    return
  }
  log('  [pass] tools/call getState returned valid envelope')
  log(`  envelope.command = ${envelope.command}`)
  log(`  envelope.ok = ${envelope.ok}`)
  log(`  envelope.state keys = ${Object.keys(envelope.state).join(',')}`)

  log('smoke PASS')
}

main()
  .catch((err) => {
    fail(err?.stack || err?.message || String(err))
  })
  .finally(() => {
    cleanup()
    // Give the SIGKILL a moment to land before exiting.
    setTimeout(() => process.exit(process.exitCode || 0), 100)
  })
