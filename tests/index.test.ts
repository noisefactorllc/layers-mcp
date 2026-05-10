// tests/index.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'

let child: ChildProcess

const ROOT = join(import.meta.dirname || __dirname, '..')

afterAll(() => {
  if (child && !child.killed) child.kill('SIGKILL')
})

describe('MCP server end-to-end (stdio JSON-RPC)', () => {
  it('responds to tools/list with a non-empty tool array', async () => {
    child = spawn('node', [join(ROOT, 'dist/index.js')], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const responsePromise = new Promise<any>((resolve, reject) => {
      let buf = ''
      child.stdout!.on('data', (chunk) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.id === 1) return resolve(msg)
          } catch { /* not JSON yet */ }
        }
      })
      child.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 90_000)
    })

    // Wait for the harness to become ready by polling stderr
    await new Promise<void>((resolve, reject) => {
      let stderrBuf = ''
      child.stderr!.on('data', (chunk) => {
        stderrBuf += chunk.toString()
        if (stderrBuf.includes('connected; targeting')) resolve()
      })
      setTimeout(() => reject(new Error('harness boot timeout')), 60_000)
    })

    const req = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/list', params: {}
    }) + '\n'
    child.stdin!.write(req)

    const resp = await responsePromise
    expect(resp.result.tools.length).toBeGreaterThan(50)
    const names = resp.result.tools.map((t: any) => t.name)
    expect(names).toContain('getState')
  }, 180_000)
})
