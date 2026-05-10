import { beforeAll } from 'vitest'

beforeAll(async () => {
  const url = process.env.LAYERS_URL
  if (!url) {
    throw new Error(
      '[layers-mcp tests] LAYERS_URL is required. ' +
        'Phase 7 tests run against a LOCAL layers dev server while layers ' +
        'Phase 1-6 is unpushed. Set LAYERS_URL=http://localhost:<port> and ' +
        'run `npm run dev` (which launches `npx http-server public -p 3002 -c-1`) ' +
        'in /Users/aayars/platform/layers/ first.'
    )
  }
  try {
    const res = await fetch(url, { redirect: 'manual' })
    if (!res.ok && res.status !== 301 && res.status !== 302) {
      throw new Error(`HTTP ${res.status}`)
    }
  } catch (err: any) {
    throw new Error(
      `[layers-mcp tests] LAYERS_URL=${url} not reachable: ${err?.message || err}. ` +
        'Start the layers dev server first (`npm run dev` in /Users/aayars/platform/layers/).'
    )
  }
})
