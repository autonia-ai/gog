import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function getConfigDir() {
  return process.env.GOG_CONFIG_DIR || join(homedir(), '.config', 'gogcli')
}

export function getConfigPath() {
  return join(getConfigDir(), 'config.json')
}

export function getCredentialsPath() {
  return join(getConfigDir(), 'credentials.json')
}

export async function readConfig() {
  try {
    const raw = await readFile(getConfigPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function writeConfig(config) {
  const dir = getConfigDir()
  await mkdir(dir, { recursive: true })
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2) + '\n')
}

export async function readCredentials() {
  try {
    const raw = await readFile(getCredentialsPath(), 'utf8')
    const parsed = JSON.parse(raw)
    // Support both { web: { ... } } and { installed: { ... } } formats
    return parsed.web || parsed.installed || parsed
  } catch {
    return null
  }
}
