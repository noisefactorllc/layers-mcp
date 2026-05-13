// tests/index.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { INTEGRATION_AVAILABLE } from './setup.js'

let child: ChildProcess
let stdoutBuf = ''
const pending = new Map<number, (msg: any) => void>()

const ROOT = join(import.meta.dirname || __dirname, '..')

afterAll(() => {
  if (child && !child.killed) child.kill('SIGKILL')
})

function startServer(): Promise<void> {
  child = spawn('node', [join(ROOT, 'dist/index.js')], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  child.stdout!.on('data', (chunk) => {
    stdoutBuf += chunk.toString()
    const lines = stdoutBuf.split('\n')
    stdoutBuf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        const resolver = pending.get(msg.id)
        if (resolver) {
          pending.delete(msg.id)
          resolver(msg)
        }
      } catch { /* not JSON yet */ }
    }
  })

  // Wait for the harness to become ready by polling stderr.
  return new Promise<void>((resolve, reject) => {
    let stderrBuf = ''
    child.stderr!.on('data', (chunk) => {
      stderrBuf += chunk.toString()
      if (stderrBuf.includes('connected; targeting')) resolve()
    })
    child.on('error', reject)
    setTimeout(() => reject(new Error('harness boot timeout')), 60_000)
  })
}

function request(id: number, method: string, params: any): Promise<any> {
  const responsePromise = new Promise<any>((resolve, reject) => {
    pending.set(id, resolve)
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`timeout waiting for response id=${id}`))
      }
    }, 60_000)
  })
  const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
  child.stdin!.write(req)
  return responsePromise
}

describe.skipIf(!INTEGRATION_AVAILABLE)('MCP server end-to-end (stdio JSON-RPC)', () => {
  it('responds to tools/list with a non-empty tool array', async () => {
    await startServer()
    const resp = await request(1, 'tools/list', {})
    expect(resp.result.tools.length).toBeGreaterThan(50)
    const names = resp.result.tools.map((t: any) => t.name)
    expect(names).toContain('getState')
  }, 180_000)

  it('returns isError + UNKNOWN_TOOL for an unknown tool name', async () => {
    // Reuses the server spawned in the previous test.
    const resp = await request(2, 'tools/call', {
      name: 'definitely-not-real',
      arguments: {}
    })
    expect(resp.result.isError).toBe(true)
    const text = resp.result.content?.[0]?.text || ''
    expect(text).toContain('UNKNOWN_TOOL')
    // Sanity: parses as an envelope shaped the way src/index.ts emits.
    const env = JSON.parse(text)
    expect(env.ok).toBe(false)
    expect(env.error?.code).toBe('UNKNOWN_TOOL')
  }, 30_000)
})
