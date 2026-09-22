import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_CREDENTIALS_FILENAME, ENV_CREDENTIALS_FILE } from './consts.js'

/**
 * Where the credentials file lives: `OWLMEANS_CREDENTIALS`, or `~/.owlmeans`.
 *
 * A CLI that talks to more than one deployment (a staging environment, a self-hosted instance)
 * points this at a different file per deployment — the file is never merged with another one, and
 * a token it holds is meaningless anywhere but the API URL it was signed in against.
 */
export const resolveEnvFile = (env: NodeJS.ProcessEnv = process.env): string =>
  env[ENV_CREDENTIALS_FILE] != null && env[ENV_CREDENTIALS_FILE] !== ''
    ? env[ENV_CREDENTIALS_FILE]
    : join(homedir(), DEFAULT_CREDENTIALS_FILENAME)

/**
 * Parse a dotenv-shaped body: `KEY=value`, an optional `export ` prefix, `#` comments, one level
 * of quoting. Deliberately small — a dotenv library would add a dependency for a format this
 * package itself writes, and this is the one shape it ever needs to read back.
 */
export const parseEnv = (content: string): Record<string, string> => {
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

/**
 * The credentials file's values alone, with no environment overlay — what a token is bound to.
 */
export const readCredentialsFile = async (env: NodeJS.ProcessEnv = process.env): Promise<Record<string, string>> =>
  parseEnv(await readFileIfPresent(resolveEnvFile(env)))

/**
 * The file, with the process environment layered over it — environment wins, but an environment
 * value that is the EMPTY STRING is treated as unset.
 *
 * The empty-string rule exists because a harness config commonly expands an unset shell variable
 * to `''` (`${VIABLE_API_TOKEN:-}`), and a literal empty override must not shadow a real value the
 * file holds — that would make "I have not set this" indistinguishable from "I am overriding this
 * to nothing", and the file is always the more deliberate of the two.
 */
export const loadOwlmeansEnv = async (env: NodeJS.ProcessEnv = process.env): Promise<Record<string, string>> => {
  const file = await readCredentialsFile(env)
  const fromEnv: Record<string, string> = {}
  Object.entries(env).forEach(([key, value]) => {
    if (value != null && value !== '') fromEnv[key] = value
  })

  return { ...file, ...fromEnv }
}

/**
 * Replace the named keys in the credentials file, keeping every other line — comments, a key this
 * call did not touch, blank lines — exactly where they were.
 *
 * Written atomically (a temp file in the same directory, then a rename) so a process killed
 * mid-write never leaves a half-written credentials file behind, and created with mode `0600`
 * because this file can hold a live access token. An existing file that is readable by anyone but
 * its owner is reported back rather than silently tightened — permissions someone else set on
 * purpose are theirs to change.
 */
export const setEnvValues = async (
  path: string, values: Record<string, string | undefined>
): Promise<{ insecurePermissions: boolean }> => {
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
