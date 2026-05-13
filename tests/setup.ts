import { beforeAll } from 'vitest'

// Every test file in this suite needs a live Layers instance + Playwright.
// CI doesn't (yet) stand one up, so we treat LAYERS_URL as the integration
// gate: present + reachable means run; absent or unreachable means skip.
//
// Tests opt in via `describe.skipIf(!INTEGRATION_AVAILABLE, ...)`. The
// boolean is decided at module-import time so describe blocks can reference
// it synchronously; the beforeAll hook below adds a reachability probe so we
// fail loudly when LAYERS_URL is set but the server is down (avoids silently
// passing a green build when the user thinks the integration tests ran).

export const INTEGRATION_AVAILABLE = !!process.env.LAYERS_URL

beforeAll(async () => {
  const url = process.env.LAYERS_URL
  if (!url) {
    // No URL — every integration suite is skipped via describe.skipIf, so
    // vitest exits cleanly with 0 failures and N skipped. Nothing to do.
    return
  }
  try {
    const res = await fetch(url, { redirect: 'manual' })
    if (!res.ok && res.status !== 301 && res.status !== 302) {
      throw new Error(`HTTP ${res.status}`)
    }
  } catch (err: any) {
    throw new Error(
      `[layers-mcp tests] LAYERS_URL=${url} not reachable: ${err?.message || err}. ` +
        'Start the layers dev server first (`npm run dev` in your layers checkout).'
    )
  }
})
