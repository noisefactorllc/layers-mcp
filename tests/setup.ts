import { beforeAll } from 'vitest'

const DEFAULT_LAYERS_URL = 'https://layers.noisefactor.io'

// Every test file in this suite needs a live Layers instance + Playwright.
// Default to production, matching runtime config and README examples. If a
// caller sets LAYERS_URL to a local dev server, we probe that instead. Either
// way, an unreachable target fails loudly instead of silently skipping the
// real browser-backed test suite.
export const TEST_LAYERS_URL = process.env.LAYERS_URL || DEFAULT_LAYERS_URL
process.env.LAYERS_URL = TEST_LAYERS_URL

export const INTEGRATION_AVAILABLE = true

beforeAll(async () => {
  try {
    const res = await fetch(TEST_LAYERS_URL, { redirect: 'manual' })
    if (!res.ok && res.status !== 301 && res.status !== 302) {
      throw new Error(`HTTP ${res.status}`)
    }
  } catch (err: any) {
    throw new Error(
      `[layers-mcp tests] LAYERS_URL=${TEST_LAYERS_URL} not reachable: ${err?.message || err}. ` +
        'Set LAYERS_URL to a reachable Layers deployment, or start the local ' +
        'Layers dev server (`npm run dev` in your layers checkout).'
    )
  }
})
