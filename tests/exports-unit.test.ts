// tests/exports-unit.test.ts
//
// Pure unit tests for the export/job tool wrappers. No browser/network: the
// wrappers only touch a handful of BrowserSession methods, so we drive them
// with hand-built fakes. This is the trickiest logic in the repo — envelope
// cloning (never mutate upstream), filePath splicing at the right nesting
// depth, and job-failure mapping — and it had no coverage that runs in CI.
import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import {
  wrapDownloadingTool,
  wrapJobTool,
  wrapBlockingJobTool,
  describeJobFailure
} from '../src/tools/exports.js'
import type { ToolDef } from '../src/tools/registry.js'
import type { BrowserSession } from '../src/harness/browser-session.js'

// --- fakes -----------------------------------------------------------------

function baseTool(handler: ToolDef['handler']): ToolDef {
  return {
    name: 'fake',
    description: '',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler
  }
}

// A fake BrowserSession whose `withDownloadCapture` runs the action and hands
// back a caller-controlled filePath, honoring `shouldWait` exactly like the
// real implementation (filePath suppressed to null when shouldWait is false).
// `runExclusiveDownload` just runs the thunk; serialization isn't under test.
function fakeSession(opts: {
  filePath?: string | null
  waitForJob?: any
  calls?: Array<{ name: string; args: unknown }>
}): BrowserSession {
  return {
    runExclusiveDownload: <T>(fn: () => Promise<T>) => fn(),
    withDownloadCapture: async (
      _outputDir: string,
      action: () => Promise<any>,
      _timeoutMs: number | undefined,
      shouldWait: (r: any) => boolean = () => true
    ) => {
      const result = await action()
      const fp = opts.filePath ?? null
      return { result, filePath: shouldWait(result) ? fp : null }
    },
    runCommand: async (name: string, args: unknown) => {
      opts.calls?.push({ name, args })
      return opts.waitForJob
    }
  } as unknown as BrowserSession
}

// ---------------------------------------------------------------------------
// wrapDownloadingTool (exportImage)
// ---------------------------------------------------------------------------
describe('wrapDownloadingTool', () => {
  it('splices filePath into a clone without mutating the upstream envelope', async () => {
    const upstreamResult = { format: 'png' }
    const upstream = { ok: true, command: 'exportImage', result: upstreamResult, state: { z: 1 } }
    const tool = wrapDownloadingTool(
      baseTool(async () => upstream),
      fakeSession({ filePath: '/out/x.png' }),
      '/out'
    )
    const resp = await tool.handler({ format: 'png' }) as any

    expect(resp.result.filePath).toBe('/out/x.png')
    expect(resp.result.format).toBe('png')
    expect(resp.ok).toBe(true)
    expect(resp.command).toBe('exportImage')
    expect(resp.state).toEqual({ z: 1 })
    // Upstream envelope + result object are untouched (clone, not mutate).
    expect((upstreamResult as any).filePath).toBeUndefined()
    expect(resp).not.toBe(upstream)
    expect(resp.result).not.toBe(upstreamResult)
  })

  it('passes an error envelope straight through (no download wait)', async () => {
    const err = { ok: false, command: 'exportImage', error: { code: 'INVALID_ARGS' } }
    const tool = wrapDownloadingTool(
      baseTool(async () => err),
      fakeSession({ filePath: '/out/x.png' }), // even if a path were on offer
      '/out'
    )
    const resp = await tool.handler({}) as any
    expect(resp).toBe(err) // same object, untouched
  })

  it('leaves the envelope unchanged when no download fired (filePath null)', async () => {
    const ok = { ok: true, command: 'exportImage', result: { format: 'png' }, state: {} }
    const tool = wrapDownloadingTool(
      baseTool(async () => ok),
      fakeSession({ filePath: null }),
      '/out'
    )
    const resp = await tool.handler({}) as any
    expect(resp).toBe(ok)
    expect(resp.result.filePath).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// wrapJobTool (exportVideo)
// ---------------------------------------------------------------------------
describe('wrapJobTool', () => {
  it('passes a synchronous kickoff error through without calling waitForJob', async () => {
    const calls: Array<{ name: string; args: unknown }> = []
    const kickoff = { ok: false, command: 'exportVideo', error: { code: 'INVALID_ARGS_RANGE' } }
    const tool = wrapJobTool(baseTool(async () => kickoff), fakeSession({ calls }), '/out')
    const resp = await tool.handler({}) as any
    expect(resp).toBe(kickoff)
    expect(calls).toHaveLength(0)
  })

  it('passes a kickoff with no jobId through without calling waitForJob', async () => {
    const calls: Array<{ name: string; args: unknown }> = []
    const kickoff = { ok: true, command: 'exportVideo', result: {} }
    const tool = wrapJobTool(baseTool(async () => kickoff), fakeSession({ calls }), '/out')
    const resp = await tool.handler({}) as any
    expect(resp).toBe(kickoff)
    expect(calls).toHaveLength(0)
  })

  it('waits the job and splices filePath into result.result via clones', async () => {
    const calls: Array<{ name: string; args: unknown }> = []
    const kickoff = { ok: true, command: 'exportVideo', result: { jobId: 'j1' } }
    const jobInnerResult = { frames: 3 }
    const jobState = { id: 'j1', status: 'succeeded', result: jobInnerResult }
    const waitEnv = { ok: true, command: 'waitForJob', result: jobState, state: { s: 1 } }
    const tool = wrapJobTool(
      baseTool(async () => kickoff),
      fakeSession({ filePath: '/out/v.zip', waitForJob: waitEnv, calls }),
      '/out'
    )
    const resp = await tool.handler({ format: 'zip' }) as any

    expect(calls).toEqual([{ name: 'waitForJob', args: { jobId: 'j1', timeoutMs: 120_000 } }])
    expect(resp.ok).toBe(true)
    expect(resp.result.status).toBe('succeeded')
    expect(resp.result.result.filePath).toBe('/out/v.zip')
    expect(resp.result.result.frames).toBe(3)
    expect(resp.state).toEqual({ s: 1 })
    // Clones all the way down — originals untouched.
    expect((jobInnerResult as any).filePath).toBeUndefined()
    expect(resp).not.toBe(waitEnv)
    expect(resp.result).not.toBe(jobState)
    expect(resp.result.result).not.toBe(jobInnerResult)
  })

  it('renames a captured video download to the final job filename and reports local size', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'layers-mcp-video-rename-'))
    const browserPath = join(outDir, 'layers-123.zip')
    writeFileSync(browserPath, 'zip-bytes')
    const calls: Array<{ name: string; args: unknown }> = []
    const kickoff = { ok: true, command: 'exportVideo', result: { jobId: 'j1' } }
    const jobInnerResult = { filename: 'requested-name.zip', exportId: 'e1' }
    const jobState = { id: 'j1', status: 'succeeded', result: jobInnerResult }
    const waitEnv = { ok: true, command: 'waitForJob', result: jobState, state: { s: 1 } }
    const tool = wrapJobTool(
      baseTool(async () => kickoff),
      fakeSession({ filePath: browserPath, waitForJob: waitEnv, calls }),
      outDir
    )

    const resp = await tool.handler({ filename: 'requested-name' }) as any

    expect(basename(resp.result.result.filePath)).toBe('requested-name.zip')
    expect(resp.result.result.sizeBytes).toBe(9)
    expect(existsSync(resp.result.result.filePath)).toBe(true)
    expect(statSync(resp.result.result.filePath).size).toBe(9)
    expect(existsSync(browserPath)).toBe(false)
    // Original job result is untouched.
    expect((jobInnerResult as any).filePath).toBeUndefined()
    expect((jobInnerResult as any).sizeBytes).toBeUndefined()
  })

  it('returns a failed waitForJob envelope as-is', async () => {
    const kickoff = { ok: true, command: 'exportVideo', result: { jobId: 'j1' } }
    const waitEnv = { ok: false, command: 'waitForJob', error: { code: 'BOOM' } }
    const tool = wrapJobTool(
      baseTool(async () => kickoff),
      fakeSession({ waitForJob: waitEnv }),
      '/out'
    )
    const resp = await tool.handler({}) as any
    expect(resp).toBe(waitEnv)
  })

  it('maps a timed-out job to JOB_TIMEOUT', async () => {
    const kickoff = { ok: true, command: 'exportVideo', result: { jobId: 'j1' } }
    const jobState = { id: 'j1', status: 'running', timedOut: true }
    const waitEnv = { ok: true, command: 'waitForJob', result: jobState, state: {} }
    const tool = wrapJobTool(
      baseTool(async () => kickoff),
      fakeSession({ filePath: null, waitForJob: waitEnv }),
      '/out'
    )
    const resp = await tool.handler({}) as any
    expect(resp.ok).toBe(false)
    expect(resp.error.code).toBe('JOB_TIMEOUT')
    expect(resp.error.details).toEqual({ jobId: 'j1', status: 'running' })
  })

  it('maps a failed job to JOB_NOT_SUCCEEDED, carrying the job error', async () => {
    const kickoff = { ok: true, command: 'exportVideo', result: { jobId: 'j1' } }
    const jobState = { id: 'j1', status: 'failed', error: { msg: 'encoder died' } }
    const waitEnv = { ok: true, command: 'waitForJob', result: jobState }
    const tool = wrapJobTool(
      baseTool(async () => kickoff),
      fakeSession({ filePath: null, waitForJob: waitEnv }),
      '/out'
    )
    const resp = await tool.handler({}) as any
    expect(resp.ok).toBe(false)
    expect(resp.error.code).toBe('JOB_NOT_SUCCEEDED')
    expect(resp.error.message).toBe('Job j1 failed')
    expect(resp.error.details).toEqual({
      jobId: 'j1', status: 'failed', jobError: { msg: 'encoder died' }
    })
  })

  it('returns a succeeded job unchanged when no download was captured', async () => {
    const kickoff = { ok: true, command: 'exportVideo', result: { jobId: 'j1' } }
    const jobState = { id: 'j1', status: 'succeeded', result: { frames: 3 } }
    const waitEnv = { ok: true, command: 'waitForJob', result: jobState, state: {} }
    const tool = wrapJobTool(
      baseTool(async () => kickoff),
      fakeSession({ filePath: null, waitForJob: waitEnv }),
      '/out'
    )
    const resp = await tool.handler({}) as any
    // Nothing to splice → the wrapper returns the waitForJob envelope verbatim.
    expect(resp).toBe(waitEnv)
    expect(resp.result.result.filePath).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// wrapBlockingJobTool (installFontBundle)
// ---------------------------------------------------------------------------
describe('wrapBlockingJobTool', () => {
  it('passes a kickoff error through without calling waitForJob', async () => {
    const calls: Array<{ name: string; args: unknown }> = []
    const kickoff = { ok: false, error: { code: 'NOPE' } }
    const tool = wrapBlockingJobTool(baseTool(async () => kickoff), fakeSession({ calls }))
    const resp = await tool.handler({}) as any
    expect(resp).toBe(kickoff)
    expect(calls).toHaveLength(0)
  })

  it('blocks on waitForJob (10 min timeout) and lifts progress.message', async () => {
    const calls: Array<{ name: string; args: unknown }> = []
    const kickoff = { ok: true, result: { jobId: 'f1' } }
    const jobState = {
      id: 'f1', status: 'succeeded', result: { count: 1 },
      progress: { message: 'Installed 100 fonts' }
    }
    const waitEnv = { ok: true, command: 'waitForJob', result: jobState, state: {} }
    const tool = wrapBlockingJobTool(
      baseTool(async () => kickoff),
      fakeSession({ waitForJob: waitEnv, calls })
    )
    const resp = await tool.handler({}) as any

    expect(calls).toEqual([{ name: 'waitForJob', args: { jobId: 'f1', timeoutMs: 600_000 } }])
    expect(resp.result.status).toBe('succeeded')
    expect(resp.result.result.count).toBe(1)
    expect(resp.result.progressMessage).toBe('Installed 100 fonts')
    // Cloned, not mutated.
    expect((jobState as any).progressMessage).toBeUndefined()
    expect(resp.result).not.toBe(jobState)
  })

  it('returns the settled envelope unchanged when there is no progress message', async () => {
    const kickoff = { ok: true, result: { jobId: 'f1' } }
    const jobState = { id: 'f1', status: 'succeeded', result: { count: 1 } }
    const waitEnv = { ok: true, command: 'waitForJob', result: jobState }
    const tool = wrapBlockingJobTool(
      baseTool(async () => kickoff),
      fakeSession({ waitForJob: waitEnv })
    )
    const resp = await tool.handler({}) as any
    expect(resp).toBe(waitEnv)
  })

  it('maps a failed install job to JOB_NOT_SUCCEEDED before lifting progress', async () => {
    const kickoff = { ok: true, result: { jobId: 'f1' } }
    const jobState = {
      id: 'f1', status: 'failed', error: { msg: 'network' },
      progress: { message: 'Downloading: 70 / 140 MB' }
    }
    const waitEnv = { ok: true, command: 'waitForJob', result: jobState }
    const tool = wrapBlockingJobTool(
      baseTool(async () => kickoff),
      fakeSession({ waitForJob: waitEnv })
    )
    const resp = await tool.handler({}) as any
    expect(resp.ok).toBe(false)
    expect(resp.error.code).toBe('JOB_NOT_SUCCEEDED')
    expect(resp.result?.progressMessage).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// describeJobFailure (direct)
// ---------------------------------------------------------------------------
describe('describeJobFailure', () => {
  it('returns null when the envelope itself failed', () => {
    expect(describeJobFailure({ ok: false, error: { code: 'X' } })).toBeNull()
  })

  it('returns null when there is no job result', () => {
    expect(describeJobFailure({ ok: true })).toBeNull()
    expect(describeJobFailure({ ok: true, result: null })).toBeNull()
  })

  it('returns null for a succeeded (or still-running, untimed) job', () => {
    expect(describeJobFailure({ ok: true, result: { id: 'j', status: 'succeeded' } })).toBeNull()
    expect(describeJobFailure({ ok: true, result: { id: 'j', status: 'running' } })).toBeNull()
    expect(describeJobFailure({ ok: true, result: {} })).toBeNull()
  })

  it('maps timedOut to JOB_TIMEOUT, preserving other envelope fields', () => {
    const env = { ok: true, command: 'waitForJob', result: { id: 'j', status: 'running', timedOut: true }, state: { z: 1 } }
    const out = describeJobFailure(env)
    expect(out.ok).toBe(false)
    expect(out.command).toBe('waitForJob')
    expect(out.state).toEqual({ z: 1 })
    expect(out.error.code).toBe('JOB_TIMEOUT')
    expect(out.error.details).toEqual({ jobId: 'j', status: 'running' })
  })

  it('maps failed and cancelled to JOB_NOT_SUCCEEDED', () => {
    for (const status of ['failed', 'cancelled']) {
      const out = describeJobFailure({ ok: true, result: { id: 'j', status, error: { e: 1 } } })
      expect(out.ok).toBe(false)
      expect(out.error.code).toBe('JOB_NOT_SUCCEEDED')
      expect(out.error.message).toBe(`Job j ${status}`)
      expect(out.error.details).toEqual({ jobId: 'j', status, jobError: { e: 1 } })
    }
  })
})
