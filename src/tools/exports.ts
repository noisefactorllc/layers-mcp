import type { BrowserSession } from '../harness/browser-session.js'
import type { ToolDef } from './registry.js'

/**
 * Wrap an existing pass-through tool so its handler also captures any download
 * triggered by the underlying LayersAgent command. The returned ToolDef has
 * the same name, description, and inputSchema as the original; only the
 * handler is replaced.
 */
export function wrapDownloadingTool(
  base: ToolDef,
  session: BrowserSession,
  outputDir: string
): ToolDef {
  return {
    ...base,
    handler: async (args: unknown) => {
      const { result, filePath } = await session.withDownloadCapture(
        outputDir,
        async () => base.handler(args)
      )
      // Splice the local path into the LayersAgent envelope.
      const env = result as any
      if (env && typeof env === 'object' && env.result && filePath) {
        env.result.filePath = filePath
      }
      return env
    }
  }
}

export const DOWNLOADING_COMMANDS = new Set(['exportImage', 'exportVideo'])
