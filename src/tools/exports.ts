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

/**
 * Wrap a job-modeled command (currently just `exportVideo`) so the MCP tool
 * synchronously waits for the job to settle. The underlying LayersAgent
 * command returns `{jobId}` immediately; the actual export runs in the
 * background and fires a browser download when it finishes.
 *
 * The handler:
 *   1. Starts download capture and kicks off the command — receives the
 *      `{jobId}` kickoff envelope back.
 *   2. While the job runs, the download fires; `withDownloadCapture`
 *      resolves with the saved file path.
 *   3. Calls `waitForJob` to retrieve the final job state.
 *   4. Splices `filePath` into the final job state's nested `result` and
 *      returns the `waitForJob` envelope.
 */
export function wrapJobTool(
  base: ToolDef,
  session: BrowserSession,
  outputDir: string
): ToolDef {
  return {
    ...base,
    handler: async (args: unknown) => {
      // Start the job, then wait for both download + job settle.
      const { result: kickoff, filePath } = await session.withDownloadCapture(
        outputDir,
        async () => base.handler(args),
        120_000
      )
      const env = kickoff as any
      if (!env?.ok || !env?.result?.jobId) return env  // pass through errors
      const jobId = env.result.jobId

      const finalEnv = await session.runCommand('waitForJob', {
        jobId, timeoutMs: 120_000
      }) as any
      if (!finalEnv?.ok) return finalEnv
      const job = finalEnv.result
      if (filePath && job?.result) job.result.filePath = filePath
      return finalEnv
    }
  }
}

export const DOWNLOADING_COMMANDS = new Set(['exportImage'])
