// tests/browser-session-unit.test.ts
//
// Non-gated unit tests for BrowserSession.withDownloadCapture — the download
// interception that backs every export tool, including the crash-recovery
// page-swap guard. These drive the REAL method (not a fake) but never launch a
// browser: a fake `page` is injected into the private field and the download
// event is fired by hand. Importing BrowserSession pulls in the Playwright
// module, but nothing here calls `chromium.launch*`, so it runs in CI without
// the browser binary (and without LAYERS_URL).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserSession } from '../src/harness/browser-session.js'
import type { Config } from '../src/config.js'

const CONFIG: Config = {
  layersUrl: '', outputDir: '', profileDir: '', headful: false, logLevel: 'info'
}

// Minimal stand-in for a Playwright Page: records the 'download' listener so
// tests can fire it, and no-ops `off`. `fireDownload` returns the listener's
// promise so a test can await full capture before proceeding.
function fakePage() {
  let handler: ((d: any) => any) | undefined
  return {
    on(ev: string, h: (d: any) => any) { if (ev === 'download') handler = h },
    off() {},
    fireDownload(filename: string): Promise<unknown> {
      return Promise.resolve(handler?.({
        suggestedFilename: () => filename,
        saveAs: async () => {} // real Playwright writes bytes; the path is what we assert
      }))
    }
  }
}

function newOutDir() {
  return mkdtempSync(join(tmpdir(), 'lmcp-bs-'))
}

afterEach(() => vi.restoreAllMocks())

describe('withDownloadCapture (no browser)', () => {
  it('captures a download fired on the active page and returns its path', async () => {
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    const page = fakePage()
    ;(session as any).page = page

    const { result, filePath } = await session.withDownloadCapture(out, async () => {
      await page.fireDownload('shot.png')
      return { ok: true, result: {} }
    })

    expect(filePath).toBe(join(out, 'shot.png'))
    expect((result as any).ok).toBe(true)
  })

  it('short-circuits to null and warns when the page is swapped mid-action', async () => {
    // Simulates the inner runCommand withRetry absorbing a browser crash:
    // it restarts and reassigns `this.page` while our action() runs. The
    // download listener is stranded on the dead page, so the guard must bail
    // immediately rather than wait out the (here, 2-minute) timeout.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    const pageA = fakePage()
    const pageB = fakePage()
    ;(session as any).page = pageA

    const start = Date.now()
    const { filePath } = await session.withDownloadCapture(
      out,
      async () => {
        ;(session as any).page = pageB // page swapped out from under us
        return { ok: true, result: {} }
      },
      120_000 // would stall this long without the guard
    )

    expect(filePath).toBeNull()
    expect(Date.now() - start).toBeLessThan(5_000) // returned promptly, not after 120s
    const logged = warn.mock.calls.map(c => c.join(' ')).join('\n')
    expect(logged).toContain('page restarted mid-export')
  })

  it('keeps an already-captured download even if the page swaps afterward', async () => {
    // Download completes on page A, THEN a later crash in the same action
    // swaps the page. The saved file is real, so the guard must return it
    // rather than discard it.
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    const pageA = fakePage()
    const pageB = fakePage()
    ;(session as any).page = pageA

    const { filePath } = await session.withDownloadCapture(out, async () => {
      await pageA.fireDownload('done.png') // fully captured first
      ;(session as any).page = pageB // ...then the page swaps
      return { ok: true, result: {} }
    })

    expect(filePath).toBe(join(out, 'done.png'))
  })

  it('returns null after the timeout when no download fires', async () => {
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    ;(session as any).page = fakePage()

    const { filePath } = await session.withDownloadCapture(
      out,
      async () => ({ ok: true, result: {} }),
      50 // tiny timeout — no download will fire
    )

    expect(filePath).toBeNull()
  })

  it('skips the download wait entirely when shouldWait returns false', async () => {
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    ;(session as any).page = fakePage()

    const start = Date.now()
    const { result, filePath } = await session.withDownloadCapture(
      out,
      async () => ({ ok: false, error: { code: 'INVALID_ARGS' } }),
      120_000,
      (r: any) => Boolean(r?.ok) // mirrors the export wrappers' shouldWait
    )

    expect(filePath).toBeNull()
    expect((result as any).ok).toBe(false)
    expect(Date.now() - start).toBeLessThan(5_000) // did not wait the timeout
  })

  it('throws if used before start() (no page)', async () => {
    const session = new BrowserSession(CONFIG)
    await expect(
      session.withDownloadCapture(newOutDir(), async () => ({ ok: true }))
    ).rejects.toThrow(/start\(\) not called/)
  })
})
