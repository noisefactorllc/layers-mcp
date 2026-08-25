import { open, unlink } from 'fs/promises'
import { basename, extname, join, resolve, sep } from 'path'

/**
 * Take exclusive ownership of `path` by creating it, or report that someone
 * already has it. `O_CREAT | O_EXCL` is the whole point: it fails on an
 * existing file *and* on a symlink, dangling or not, which a `stat()` probe
 * cannot see — a dangling link reports ENOENT, so a check-then-write resolver
 * calls the name free and the subsequent write follows the link out of the
 * directory. It is also atomic, so two callers racing for the same name
 * cannot both win.
 */
async function claim(path: string): Promise<boolean> {
  let handle
  try {
    handle = await open(path, 'wx')
  } catch (err: any) {
    if (err?.code === 'EEXIST') return false
    throw err
  }
  await handle.close()
  return true
}

/**
 * Reserve a path for a download inside `outputDir`, and return it.
 *
 * **This creates the file** — an empty placeholder the caller is expected to
 * overwrite (Playwright's `saveAs` and `rename` both do). Reserving rather
 * than probing is what makes the two guarantees below hold under a race.
 *
 *  - **Containment.** `suggestedFilename()` is page-supplied: it comes from a
 *    `download` attribute or a Content-Disposition header, and LAYERS_URL
 *    points wherever the operator aims it. `join(dir, '../x.png')` normalizes
 *    straight out of `outputDir`, so the name is reduced to its basename, and
 *    the names that survive that but still traverse — `.` and `..`, which
 *    `basename` returns unchanged — are replaced outright.
 *  - **No clobbering.** Playwright's `saveAs` overwrites. Exporting the same
 *    project twice, or reusing the app's default name, would otherwise leave
 *    one file where the caller asked for two. Colliding names get `-1`, `-2`…
 *    inserted before the extension.
 *
 * `currentPath`, when given, is a path the caller already owns — it counts as
 * free rather than as a collision, and is returned without being re-reserved,
 * so re-finalizing a file onto itself is a no-op instead of climbing suffixes.
 */
export async function uniqueDownloadPath(
  outputDir: string,
  filename: string,
  currentPath?: string
): Promise<string> {
  const raw = basename(filename)
  const safeName = (raw === '' || raw === '.' || raw === '..') ? 'download' : raw

  const first = join(outputDir, safeName)
  assertInside(outputDir, first)
  if (first === currentPath) return first
  if (await claim(first)) return first

  const ext = extname(safeName)
  const stem = ext ? safeName.slice(0, -ext.length) : safeName
  for (let i = 1; ; i++) {
    const candidate = join(outputDir, `${stem}-${i}${ext}`)
    if (candidate === currentPath) return candidate
    if (await claim(candidate)) return candidate
  }
}

/** Release a reservation the caller could not use. Never throws. */
export async function releaseDownloadPath(path: string): Promise<void> {
  try { await unlink(path) } catch { /* already gone, or never ours */ }
}

/**
 * Belt-and-braces on the containment rule above. `safeName` is a basename and
 * is never `.` or `..`, so this cannot fire today — it exists so that a future
 * edit loosening the name handling fails loudly here instead of silently
 * writing outside the directory.
 */
function assertInside(outputDir: string, candidate: string): void {
  const root = resolve(outputDir)
  const target = resolve(candidate)
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`refusing to write outside the output directory: ${candidate}`)
  }
}
