// tests/download-collisions.test.ts
//
// Export downloads must not destroy each other. `withDownloadCapture` saves to
// `outputDir/suggestedFilename()`, and Playwright's `saveAs` overwrites — so
// two exports whose in-app filename matches (the same project exported twice,
// the default name reused) silently leave one file where the caller asked for
// two. Drives the real method with a fake page, no browser.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserSession } from '../src/harness/browser-session.js'
import type { Config } from '../src/config.js'

const CONFIG: Config = {
  layersUrl: '', outputDir: '', profileDir: '', headful: false, logLevel: 'error'
}

/** A page whose downloads actually land on disk, so collisions are observable. */
function writingPage() {
  let handler: ((d: any) => any) | undefined
  return {
    on(ev: string, h: (d: any) => any) { if (ev === 'download') handler = h },
    off() {},
    fireDownload(filename: string, contents: string): Promise<unknown> {
      return Promise.resolve(handler?.({
        suggestedFilename: () => filename,
        saveAs: async (dest: string) => { writeFileSync(dest, contents) }
      }))
    }
  }
}

function newOutDir() {
  return mkdtempSync(join(tmpdir(), 'lmcp-collide-'))
}

describe('download collisions', () => {
  it('a second export with the same filename does not overwrite the first', async () => {
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    const page = writingPage()
    ;(session as any).page = page

    const first = await session.withDownloadCapture(out, async () => {
      await page.fireDownload('export.png', 'FIRST')
      return { ok: true, result: {} }
    })
    const second = await session.withDownloadCapture(out, async () => {
      await page.fireDownload('export.png', 'SECOND')
      return { ok: true, result: {} }
    })

    expect(first.filePath).toBe(join(out, 'export.png'))
    expect(second.filePath).not.toBe(first.filePath)
    expect(existsSync(first.filePath!)).toBe(true)
    expect(readFileSync(first.filePath!, 'utf8')).toBe('FIRST')
    expect(readFileSync(second.filePath!, 'utf8')).toBe('SECOND')
  })

  it('a pre-existing file in the output directory is left alone', async () => {
    const out = newOutDir()
    const existing = join(out, 'export.png')
    writeFileSync(existing, 'PRIOR RUN')

    const session = new BrowserSession(CONFIG)
    const page = writingPage()
    ;(session as any).page = page

    const { filePath } = await session.withDownloadCapture(out, async () => {
      await page.fireDownload('export.png', 'NEW')
      return { ok: true, result: {} }
    })

    expect(filePath).not.toBe(existing)
    expect(readFileSync(existing, 'utf8')).toBe('PRIOR RUN')
    expect(readFileSync(filePath!, 'utf8')).toBe('NEW')
  })

  it('suffixes climb past several collisions', async () => {
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    const page = writingPage()
    ;(session as any).page = page

    const paths: string[] = []
    for (let i = 0; i < 4; i++) {
      const { filePath } = await session.withDownloadCapture(out, async () => {
        await page.fireDownload('clip.webm', `TAKE${i}`)
        return { ok: true, result: {} }
      })
      paths.push(filePath!)
    }

    expect(new Set(paths).size).toBe(4)
    paths.forEach((p, i) => expect(readFileSync(p, 'utf8')).toBe(`TAKE${i}`))
    expect(paths[0]).toBe(join(out, 'clip.webm'))
    expect(paths[1]).toBe(join(out, 'clip-1.webm'))
  })

  it('the first export of a name is unchanged — the plain path, no suffix', async () => {
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    const page = writingPage()
    ;(session as any).page = page

    const { filePath } = await session.withDownloadCapture(out, async () => {
      await page.fireDownload('only.png', 'ONE')
      return { ok: true, result: {} }
    })

    expect(filePath).toBe(join(out, 'only.png'))
  })

  it('a download whose suggested name has path separators stays inside outputDir', async () => {
    const out = newOutDir()
    const session = new BrowserSession(CONFIG)
    const page = writingPage()
    ;(session as any).page = page

    const { filePath } = await session.withDownloadCapture(out, async () => {
      await page.fireDownload('../escape.png', 'NOPE')
      return { ok: true, result: {} }
    })

    expect(filePath).toBe(join(out, 'escape.png'))
    expect(existsSync(join(out, 'escape.png'))).toBe(true)
  })
})
