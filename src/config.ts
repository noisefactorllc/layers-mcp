import { homedir } from 'os'
import { join } from 'path'

export interface Config {
  layersUrl: string
  outputDir: string
  profileDir: string
  headful: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export function loadConfig(): Config {
  const layersUrl = process.env.LAYERS_URL || 'https://layers.noisefactor.io'
  const outputDir = process.env.LAYERS_MCP_OUTPUT_DIR ||
    join(process.cwd(), 'layers-mcp-exports')
  const profileDir = process.env.LAYERS_MCP_PROFILE_DIR ||
    join(homedir(), '.cache', 'layers-mcp', 'profile')
  const headful = process.env.LAYERS_MCP_HEADFUL === 'true'
  const level = (process.env.LAYERS_MCP_LOG_LEVEL || 'info') as Config['logLevel']
  if (!['debug', 'info', 'warn', 'error'].includes(level)) {
    throw new Error(`LAYERS_MCP_LOG_LEVEL must be debug|info|warn|error, got: ${level}`)
  }
  return { layersUrl, outputDir, profileDir, headful, logLevel: level }
}
