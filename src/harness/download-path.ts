import { stat } from 'fs/promises'
import { basename, extname, join } from 'path'

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (err: any) {
    if (err?.code === 'ENOENT') return false
    throw err
  }
}

/**
 * Resolve where a download should land inside `outputDir`.
 *
 * Two jobs, both of which the caller would otherwise get wrong:
 *
 *  - **Containment.** `suggestedFilename()` is attacker-adjacent data: it comes
 *    from the page's `download` attribute or a Content-Disposition header, and
 *    `LAYERS_URL` points wherever the operator aims it. `join(dir, '../x.png')`
 *    normalizes straight out of `outputDir`, so the name is reduced to its
 *    basename first.
 *  - **No clobbering.** Playwright's `saveAs` overwrites. Exporting the same
 *    project twice, or reusing the app's default name, would otherwise leave
 *    one file where the caller asked for two. Colliding names get `-1`, `-2`…
 *    inserted before the extension.
 *
 * `currentPath`, when given, is a path the caller already owns — it counts as
 * free rather than as a collision, so re-finalizing a file onto itself is a
 * no-op instead of endlessly climbing suffixes.
 */
export async function uniqueDownloadPath(
  outputDir: string,
  filename: string,
  currentPath?: string
): Promise<string> {
  const safeName = basename(filename) || 'download'
  const first = join(outputDir, safeName)
  if (first === currentPath || !(await pathExists(first))) return first

  const ext = extname(safeName)
  const stem = ext ? safeName.slice(0, -ext.length) : safeName
  for (let i = 1; ; i++) {
    const candidate = join(outputDir, `${stem}-${i}${ext}`)
    if (candidate === currentPath || !(await pathExists(candidate))) return candidate
  }
}
