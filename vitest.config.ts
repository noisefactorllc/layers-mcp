import { defineConfig } from 'vitest/config'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// A checkout can keep the Playwright browsers in this repo-local, gitignored
// cache instead of the default ~/.cache/ms-playwright — e.g. sandboxes where
// $HOME sits on a noexec tmpfs, where the default location can't hold a
// runnable browser. Prefer it when present; the caller's explicit
// PLAYWRIGHT_BROWSERS_PATH always wins, and CI runners (no such directory)
// are unaffected. The env var is read by Playwright at launch time, so
// setting it here covers the spawned-server tests in index.test.ts too.
const root = dirname(fileURLToPath(import.meta.url))
const localBrowsers = join(root, '.ms-playwright')
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers
}

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    testTimeout: 60_000
  }
})
