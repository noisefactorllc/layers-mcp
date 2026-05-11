import { beforeAll } from 'vitest'

beforeAll(async () => {
  const url = process.env.LAYERS_URL
  if (!url) {
    throw new Error(
      '[layers-mcp tests] LAYERS_URL is required. Set it to a running Layers ' +
        'instance (default port 3002 for `npm run dev` in the layers repo) or ' +
        'to https://layers.noisefactor.io once the agent build is deployed.'
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
        'Start the layers dev server first (`npm run dev` in your layers checkout).'
    )
  }
})
