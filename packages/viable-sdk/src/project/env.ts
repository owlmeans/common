import fs from 'fs-extra'
import net from 'node:net'
import p from 'node:path'

import { CONNECT_ENV_BEGIN, CONNECT_ENV_END, SubProject } from '@owlmeans/viable-common'
import type { ConfigurePayload, ConfigureResult, ConnectServices } from '@owlmeans/viable-common'

import { confineToProject } from '../executor/files.js'
import { subprojectDir, targetPaths } from '../executor/layout.js'

/**
 * The target's `.env` files — the one thing about a local project the platform does not own.
 *
 * A slot's configuration is pushed into a pod and the pod's environment is the platform's to
 * compose. On a developer's machine the same values live in a file the developer also writes: the
 * database URL is theirs (nothing provisions a database on a laptop), and so is anything else
 * they added. So a configure push rewrites only what it wrote last time — the block between the
 * two markers — and every line outside it survives untouched.
 */

/**
 * Keys the target cannot authenticate without.
 *
 * Reported exactly like the publisher's `ConfigureAck.missing`: a key with an EMPTY value counts
 * as MISSING, because a push that ran before a secret existed leaves one behind, and a target
 * holding `OIDC_CLIENT=''` is a target whose users can never sign in — with nothing anywhere
 * saying so.
 */
export const REQUIRED_ENV_KEYS = ['OIDC_ISSUER_URL', 'OIDC_CLIENT', 'OIDC_SECRET']

/** How long a service probe waits before calling a port unreachable. */
const PROBE_TIMEOUT_MS = 1_500

const DEFAULT_PORTS: Record<string, number> = { postgres: 5432, postgresql: 5432, redis: 6379, rediss: 6379, valkey: 6379 }

export interface TargetEnv {
  /** Project-relative path → the values that file declares. */
  files: Record<string, Record<string, string>>
  /** Everything the target's processes see, later files overriding earlier ones. */
  values: Record<string, string>
}

/**
 * Parse a `.env` body.
 *
 * Deliberately small: `KEY=value`, an optional `export ` prefix, `#` comments, and one level of
 * quoting. A dotenv library would add a dependency for a format the platform itself writes, and
 * anything it understands that this does not is something the target's own runtime would have to
 * understand too.
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

/**
 * The api's and the worker's environment — the process side of the target.
 *
 * Everything a server may hold lives here and nowhere else: the database URL, the queue URL, the
 * OIDC secret.
 */
export const ROOT_ENV_FILE = '.env'

/**
 * The browser bundle's environment.
 *
 * A SEPARATE file, and the separation is the whole leak boundary: whatever is in it gets compiled
 * into a bundle anybody can read, so nothing may reach it by merging in the server's file.
 */
export const webEnvFile = (dir: string): string =>
  `${targetPaths(dir).dir}/${subprojectDir(dir, SubProject.Web)}/${ROOT_ENV_FILE}`

/** The env files a target has, in the order a later one overrides an earlier one. */
export const envFilePaths = (dir: string): string[] => [ROOT_ENV_FILE, webEnvFile(dir)]

/** One env file's values; `{}` for a file that is not there. */
export const readEnvFile = async (dir: string, file: string): Promise<Record<string, string>> => {
  const content = await fs.readFile(confineToProject(dir, file), 'utf-8').catch(() => null)

  return content == null ? {} : parseEnv(content)
}

/** Every env file the target has, parsed. */
export const readEnv = async (dir: string): Promise<TargetEnv> => {
  const files: Record<string, Record<string, string>> = {}
  let values: Record<string, string> = {}
  for (const file of envFilePaths(dir)) {
    const parsed = await readEnvFile(dir, file)
    files[file] = parsed
    values = { ...values, ...parsed }
  }

  return { files, values }
}

/**
 * Write the platform's block into each named file, keeping every line the user wrote.
 *
 * The block is delimited rather than diffed because the two writers have no other way to agree on
 * ownership: the platform composes its half whole (it is the only side that knows the OIDC client
 * and its secret) and the user's half is arbitrary. A file with no block yet gets one appended; a
 * file that does not exist is created with the block as its whole content.
 */
export const writeEnv = async (dir: string, payload: ConfigurePayload): Promise<ConfigureResult> => {
  const written: string[] = []

  for (const file of payload.files ?? []) {
    const path = confineToProject(dir, file.path)
    const existing = await fs.readFile(path, 'utf-8').catch(() => '')
    const next = replaceManagedBlock(existing, yieldToUser(existing, file.content ?? ''))
    if (next !== existing) {
      await fs.ensureDir(p.dirname(path))
      await fs.writeFile(path, next)
    }
    written.push(file.path)
  }

  const { values } = await readEnv(dir)

  return {
    written,
    missing: REQUIRED_ENV_KEYS.filter(key => (values[key] ?? '') === ''),
    services: await probeServices(values, payload.probe),
  }
}

/**
 * The same verdict a configure push answers with, without writing anything.
 *
 * A connector needs it before it asks the platform for work — a run that needs a database and a
 * target that has none is a job that will block, and saying so up front is cheaper than finding
 * out from a boot check.
 */
export const envStatus = async (
  dir: string, probe: Array<keyof ConnectServices> = ['db', 'valkey']
): Promise<ConfigureResult> => {
  const { values } = await readEnv(dir)

  return {
    written: [],
    missing: REQUIRED_ENV_KEYS.filter(key => (values[key] ?? '') === ''),
    services: await probeServices(values, probe),
  }
}

/** The file with the platform's block cut out — everything the user wrote, and only that. */
export const outsideManagedBlock = (existing: string): string => {
  const begin = existing.indexOf(CONNECT_ENV_BEGIN)
  if (begin < 0) return existing

  const end = existing.indexOf(CONNECT_ENV_END, begin)

  return end < 0
    ? existing.slice(0, begin)
    : `${existing.slice(0, begin)}${existing.slice(end + CONNECT_ENV_END.length)}`
}

/**
 * Stand down from every key the user has assigned themselves.
 *
 * "Everything outside the block is yours" has to be true of the VALUES, not only of the lines. A
 * `.env` gives the last assignment of a key, and the block is appended, so a platform line silently
 * outranked whatever the user wrote above it — `DATABASE_URL` included, which is the one value the
 * platform cannot supply and the setup guide tells people to write themselves. The result was an
 * application connecting to the placeholder no matter what its owner put in the file.
 *
 * A yielded key is replaced by a comment rather than dropped, so the file says why the platform is
 * not setting something it normally would.
 */
export const yieldToUser = (existing: string, content: string): string => {
  const theirs = parseEnv(outsideManagedBlock(existing))
  if (Object.keys(theirs).length < 1) return content

  return content.split('\n').map(raw => {
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(raw.trim())
    if (match == null || !(match[1] in theirs)) return raw

    return `# ${match[1]} is set in your own lines, so this block leaves it to you.`
  }).join('\n')
}

/**
 * Replace what sits between the markers, and nothing else.
 *
 * A BEGIN with no END — a file truncated mid-write, or hand-edited — is rewritten to the end of
 * the file rather than left alone: the alternative is a block that grows a second copy of itself
 * on every push, and the text after a lost END was the platform's anyway.
 */
export const replaceManagedBlock = (existing: string, content: string): string => {
  const body = content.replace(/^\n+|\n+$/g, '')
  const block = `${CONNECT_ENV_BEGIN}\n${body === '' ? '' : `${body}\n`}${CONNECT_ENV_END}\n`

  const begin = existing.indexOf(CONNECT_ENV_BEGIN)
  if (begin < 0) {
    const prefix = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`

    return `${prefix}${block}`
  }

  const end = existing.indexOf(CONNECT_ENV_END, begin)
  const after = end < 0 ? existing.length : end + CONNECT_ENV_END.length

  return `${existing.slice(0, begin)}${block}${existing.slice(after).replace(/^\n/, '')}`
}

/**
 * What this machine actually provides.
 *
 * Reported, never assumed — the platform provisions nothing here, so the only honest answer comes
 * from a connect attempt. A service the caller did not ask about stays `false` rather than
 * becoming an unrequested round trip.
 */
const probeServices = async (
  values: Record<string, string>, probe?: Array<keyof ConnectServices>
): Promise<ConnectServices> => {
  const wanted = new Set(probe ?? [])

  return {
    db: wanted.has('db') ? await probeUrl(values.DATABASE_URL) : false,
    valkey: wanted.has('valkey') ? await probeUrl(values.VALKEY_URL) : false,
  }
}

/**
 * The host and port a connection URL names.
 *
 * `null` for anything unparseable, so a malformed value degrades to "not reachable" rather than
 * throwing somewhere a caller has no branch for it.
 */
export const serviceEndpoint = (url: string | undefined): { host: string, port: number } | null => {
  if (url == null || url === '') return null

  try {
    const parsed = new URL(url)
    const port = parsed.port !== ''
      ? parseInt(parsed.port)
      : DEFAULT_PORTS[parsed.protocol.replace(':', '')]
    if (parsed.hostname === '' || port == null || Number.isNaN(port)) return null

    return { host: parsed.hostname, port }
  } catch {
    return null
  }
}

/** Whether something is listening where a connection string points. Exported for the setup flow. */
export const probeUrl = async (url: string | undefined): Promise<boolean> => {
  const endpoint = serviceEndpoint(url)

  return endpoint == null ? false : await probePort(endpoint.host, endpoint.port)
}

export const probePort = async (
  host: string, port: number, timeoutMs = PROBE_TIMEOUT_MS
): Promise<boolean> => await new Promise<boolean>(resolve => {
  const socket = net.connect({ host, port })
  const done = (value: boolean) => {
    socket.removeAllListeners()
    socket.destroy()
    resolve(value)
  }
  socket.setTimeout(timeoutMs)
  socket.once('connect', () => done(true))
  socket.once('timeout', () => done(false))
  socket.once('error', () => done(false))
})
