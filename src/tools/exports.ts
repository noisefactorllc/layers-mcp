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
      const { result, filePath } = await session.runExclusiveDownload(() =>
        session.withDownloadCapture(
          outputDir,
          async () => base.handler(args),
          undefined,
          // Synchronous error envelope (e.g. INVALID_ARGS) means no download
          // will fire — skip the wait.
          (env: any) => Boolean(env?.ok)
        )
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
 * Map a settled-job envelope into the appropriate MCP-level error response
 * when the job didn't reach 'succeeded'. Returns null when the envelope is
 * fine (job is succeeded OR caller envelope itself failed and we should just
 * pass it through unchanged).
 */
function describeJobFailure(finalEnv: any): any | null {
  if (!finalEnv?.ok) return null
  const job = finalEnv.result
  if (!job) return null
  if (job.timedOut) {
    return {
      ...finalEnv,
      ok: false,
      error: {
        code: 'JOB_TIMEOUT',
        message: `Job ${job.id ?? '?'} did not settle within timeout`,
        details: { jobId: job.id, status: job.status }
      }
    }
  }
  if (job.status === 'failed' || job.status === 'cancelled') {
    return {
      ...finalEnv,
      ok: false,
      error: {
        code: 'JOB_NOT_SUCCEEDED',
        message: `Job ${job.id ?? '?'} ${job.status}`,
        details: { jobId: job.id, status: job.status, jobError: job.error }
      }
    }
  }
  return null
}

/**
 * Wrap a job-modeled command that ALSO produces a browser download (today:
 * `exportVideo`). The underlying LayersAgent command returns `{jobId}`
 * immediately; the actual export runs in the background and fires a browser
 * download when it finishes.
 *
 * The handler:
 *   1. Starts download capture and kicks off the command — receives the
 *      `{jobId}` kickoff envelope back.
 *   2. While the job runs, the download fires; `withDownloadCapture`
 *      resolves with the saved file path.
 *   3. Calls `waitForJob` to retrieve the final job state.
 *   4. Splices `filePath` into the final job state's nested `result` and
 *      returns the `waitForJob` envelope (or an MCP-level error envelope on
 *      timeout / failure / cancellation).
 */
export function wrapJobTool(
  base: ToolDef,
  session: BrowserSession,
  outputDir: string
): ToolDef {
  return {
    ...base,
    handler: async (args: unknown) => {
      // Serialize on the JS side: the in-browser dispatcher serializes
      // commands, but the page-level download listener race is on the JS
      // side, so concurrent export tools must take turns acquiring the mutex.
      return session.runExclusiveDownload(async () => {
        const { result: kickoff, filePath } = await session.withDownloadCapture(
          outputDir,
          async () => base.handler(args),
          120_000,
          // Don't wait on a download if the kickoff already failed
          // synchronously (e.g. INVALID_ARGS): no download will ever fire.
          (env: any) => Boolean(env?.ok && env?.result?.jobId)
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

        const failureEnv = describeJobFailure(finalEnv)
        if (failureEnv) return failureEnv
        return finalEnv
      })
    }
  }
}

/**
 * Wrap a job-modeled command that does NOT produce a browser download (today:
 * `installFontBundle`, which pulls the bundle via in-page `fetch()` into
 * IndexedDB rather than via the browser's download pipeline). The MCP call
 * blocks until the job settles, but no download capture is wired up.
 *
 * Default timeout is 10 minutes — the bundle is ~140 MB and the loader
 * does its own extraction phase.
 */
export function wrapBlockingJobTool(
  base: ToolDef,
  session: BrowserSession
): ToolDef {
  return {
    ...base,
    handler: async (args: unknown) => {
      const kickoff = await base.handler(args) as any
      if (!kickoff?.ok || !kickoff?.result?.jobId) return kickoff
      const jobId = kickoff.result.jobId
      const finalEnv = await session.runCommand('waitForJob', {
        jobId, timeoutMs: 600_000   // 10 min — installFontBundle pulls ~140 MB
      }) as any
      const failureEnv = describeJobFailure(finalEnv)
      if (failureEnv) return failureEnv
      return finalEnv
    }
  }
}

export const DOWNLOADING_COMMANDS = new Set(['exportImage'])
