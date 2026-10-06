import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_CREDENTIALS_FILENAME, ENV_CREDENTIALS_FILE } from './consts.js'
import type { EnvFileHelper, SetEnvValuesResult } from './env-file/types.js'

export const createEnvFileHelper = (): EnvFileHelper => {
  const resolveEnvFile = (env: NodeJS.ProcessEnv = process.env): string =>
    env[ENV_CREDENTIALS_FILE] != null && env[ENV_CREDENTIALS_FILE] !== ''
      ? env[ENV_CREDENTIALS_FILE]
      : join(homedir(), DEFAULT_CREDENTIALS_FILENAME)

  const parseEnv = (content: string): Record<string, string> => {
    const values: Record<string, string> = {}
    for (const raw of content.split('\n')) {
      const line = raw.trim()
      if (line === '' || line.startsWith('#')) continue

      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (match == null) continue

      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"') && value.length > 1)
        || (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
        value = value.slice(1, -1)
      }
      values[match[1]] = value
    }

    return values
  }

  const readFileIfPresent = async (path: string): Promise<string> =>
    await readFile(path, 'utf-8').catch(() => '')

  const readCredentialsFile = async (env: NodeJS.ProcessEnv = process.env): Promise<Record<string, string>> =>
    parseEnv(await readFileIfPresent(resolveEnvFile(env)))

  const loadOwlmeansEnv = async (env: NodeJS.ProcessEnv = process.env): Promise<Record<string, string>> => {
    const file = await readCredentialsFile(env)
    const fromEnv: Record<string, string> = {}
    Object.entries(env).forEach(([key, value]) => {
      if (value != null && value !== '') fromEnv[key] = value
    })

    return { ...file, ...fromEnv }
  }

  const setEnvValues = async (
    path: string, values: Record<string, string | undefined>
  ): Promise<SetEnvValuesResult> => {
    const existing = await readFileIfPresent(path)
    const lines = existing === '' ? [] : existing.split('\n')
    const claimed = new Set<string>()

    const rewritten = lines.map(line => {
      const trimmed = line.trim()
      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed)
      if (match == null || !(match[1] in values)) return line

      claimed.add(match[1])
      const value = values[match[1]]

      return value == null ? null : `${match[1]}=${value}`
    }).filter((line): line is string => line != null)

    Object.entries(values).forEach(([key, value]) => {
      if (claimed.has(key) || value == null) return
      rewritten.push(`${key}=${value}`)
    })

    const body = `${rewritten.join('\n').replace(/\n+$/, '')}\n`

    await mkdir(dirname(path), { recursive: true })
    const tmp = join(dirname(path), `.${DEFAULT_CREDENTIALS_FILENAME}.${randomBytes(6).toString('hex')}.tmp`)
    await writeFile(tmp, body, { mode: 0o600 })
    await rename(tmp, path)
    await chmod(path, 0o600).catch(() => undefined)

    let insecurePermissions = false
    try {
      const info = await stat(path)
      insecurePermissions = (info.mode & 0o077) !== 0
    } catch {
      // Nothing to report if the stat itself fails right after a successful write — unusual enough
      // that guessing at a permission problem would be noise.
    }

    return { insecurePermissions }
  }

  return { resolveEnvFile, parseEnv, readCredentialsFile, loadOwlmeansEnv, setEnvValues }
}

export const envFileHelper = createEnvFileHelper()

/** @deprecated compat:factory-refactor — use `envFileHelper.loadOwlmeansEnv(…)` */
export const loadOwlmeansEnv = async (env: NodeJS.ProcessEnv = process.env): Promise<Record<string, string>> =>
  await envFileHelper.loadOwlmeansEnv(env)
