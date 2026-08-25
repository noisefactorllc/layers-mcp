// tests/download-path.test.ts
//
// Direct coverage of the download path resolver. The collision tests drive it
// through withDownloadCapture; these pin the contract itself — the pieces a
// caller depends on that no end-to-end path happens to exercise.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { uniqueDownloadPath } from '../src/harness/download-path.js'

function newOutDir() {
  return mkdtempSync(join(tmpdir(), 'lmcp-dp-'))
}

describe('uniqueDownloadPath', () => {
  it('reduces a page-supplied name to its basename', async () => {
    const out = newOutDir()
    expect(await uniqueDownloadPath(out, '../escape.png')).toBe(join(out, 'escape.png'))
    expect(await uniqueDownloadPath(out, '/etc/passwd')).toBe(join(out, 'passwd'))
    expect(await uniqueDownloadPath(out, 'a/b/c/deep.png')).toBe(join(out, 'deep.png'))
  })

  it('never resolves to the output directory itself or its parent', async () => {
    // basename('..') is '..', and join(dir, '..') IS the parent — containment
    // must be stated, not left to whether the parent happens to exist.
    const out = newOutDir()
    for (const name of ['..', '.', '', '/', '//']) {
      const resolved = await uniqueDownloadPath(out, name)
      expect(dirname(resolved)).toBe(out)
      expect(resolved).not.toBe(out)
      expect(resolved).not.toBe(dirname(out))
    }
  })

  it('treats currentPath as already owned rather than as a collision', async () => {
    const out = newOutDir()
    const mine = join(out, 'clip.webm')
    writeFileSync(mine, 'MINE')
    // Without the short-circuit this would climb to clip-1.webm and the caller
    // would rename a correct file onto a pointless suffix.
    expect(await uniqueDownloadPath(out, 'clip.webm', mine)).toBe(mine)
  })

  it('honours currentPath deeper in the suffix ladder', async () => {
    const out = newOutDir()
    writeFileSync(join(out, 'clip.webm'), 'OTHER')
    const mine = join(out, 'clip-1.webm')
    writeFileSync(mine, 'MINE')
    expect(await uniqueDownloadPath(out, 'clip.webm', mine)).toBe(mine)
  })

  it('does not hand back a path that is a symlink out of the directory', async () => {
    // A dangling symlink is invisible to stat(): it reports ENOENT, so a
    // check-then-write resolver calls the name free and the save follows the
    // link straight out of outputDir.
    const out = newOutDir()
    const elsewhere = mkdtempSync(join(tmpdir(), 'lmcp-outside-'))
    const target = join(elsewhere, 'pwned.png')
    symlinkSync(target, join(out, 'export.png'))

    const resolved = await uniqueDownloadPath(out, 'export.png')

    expect(resolved).not.toBe(join(out, 'export.png'))
    writeFileSync(resolved, 'SAFE')
    expect(existsSync(target)).toBe(false)
  })

  it('reserves the name it returns, so concurrent callers cannot collide', async () => {
    const out = newOutDir()
    const results = await Promise.all(
      Array.from({ length: 8 }, () => uniqueDownloadPath(out, 'shot.png'))
    )
    expect(new Set(results).size).toBe(8)
    for (const r of results) expect(dirname(r)).toBe(out)
  })

  it('creates the reservation inside outputDir and nowhere else', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'lmcp-parent-'))
    const out = join(parent, 'exports')
    mkdirSync(out)
    await uniqueDownloadPath(out, '../../escape.png')
    expect(readdirSync(parent)).toEqual(['exports'])
  })
})
