import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadConfig, type Config } from '../src/config.js'

export function makeTestConfig(prefix: string): Config {
  return {
    ...loadConfig(),
    outputDir: mkdtempSync(join(tmpdir(), `${prefix}-exports-`)),
    profileDir: mkdtempSync(join(tmpdir(), `${prefix}-profile-`))
  }
}

export function makeTestEnv(prefix: string): NodeJS.ProcessEnv {
  const config = makeTestConfig(prefix)
  return {
    ...process.env,
    LAYERS_MCP_OUTPUT_DIR: config.outputDir,
    LAYERS_MCP_PROFILE_DIR: config.profileDir
  }
}
