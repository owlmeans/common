import fs from 'fs-extra'
import p from 'node:path'
import { spawn } from 'node:child_process'

import { hasWorker } from '../executor/layout.js'
import { CONNECT_ENV_BEGIN, CONNECT_ENV_END } from '@owlmeans/viable-common'

import { probeUrl, readEnv, ROOT_ENV_FILE } from './env.js'

/**
 * What a project needs before it can run here, and what this machine already provides.
 *
 * The platform provisions nothing on somebody's own computer: a database and, for a project with a
 * background worker, a queue store are the two things it cannot supply and cannot guess. So the
 * connector's job is to find out what is already there, and where nothing is, to ASK — never to
 * install something on a person's machine on its own initiative, and never to invent a connection
 * string and let the failure surface later as a boot error nobody can place.
 */

export interface ServiceState {
  /** A connection string is present in the project's own half of the `.env`. */
  configured: boolean
  /** Something answers where it points. False for an unset URL and for one nothing listens on. */
  reachable: boolean
  /** The value, with everything between the scheme and the host removed. */
  redacted?: string
}

export interface SetupReport {
  dir: string
  /** Only a project with a worker needs a queue store; for the rest it is noise. */
  needsWorker: boolean
  database: ServiceState
  queue: ServiceState
  /** The command-line tools the paths below depend on. */
  tools: { bun: boolean, git: boolean, docker: boolean }
  platform: NodeJS.Platform
  /** Whether the file holding these values is kept out of the project's history. */
  envIgnored: boolean
}

/** Everything a connection string says except who is connecting. */
export const redactUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    if (parsed.username !== '' || parsed.password !== '') {
      parsed.username = '***'
      parsed.password = ''
    }

    return parsed.toString()
  } catch {
    return url.replace(/\/\/[^@/]*@/, '//***@')
  }
}

/** Whether a command can be run here. `--version` rather than `which`, which Windows lacks. */
export const probeCommand = async (command: string): Promise<boolean> =>
  await new Promise<boolean>(resolve => {
    const child = spawn(command, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' })
    const settle = (ok: boolean): void => { resolve(ok) }
    child.once('error', () => { settle(false) })
    child.once('exit', code => { settle(code === 0) })
    setTimeout(() => { child.kill(); settle(false) }, 4_000).unref?.()
  })

const stateOf = async (url: string | undefined): Promise<ServiceState> => {
  const configured = url != null && url.trim() !== '' && !url.includes('postgres:postgres@localhost:5432')

  return {
    configured,
    reachable: configured ? await probeUrl(url) : false,
    ...(configured ? { redacted: redactUrl(url!) } : {}),
  }
}

/** Whether the project's own `.env` is kept out of its history — it holds credentials. */
const envIsIgnored = async (dir: string): Promise<boolean> => {
  const ignore = await fs.readFile(p.join(dir, '.gitignore'), 'utf-8').catch(() => '')

  return /^\s*\.env\s*$/m.test(ignore) || /^\s*\*\.env\s*$/m.test(ignore) || /^\s*\.env\*/m.test(ignore)
}

export const readSetupReport = async (dir: string): Promise<SetupReport> => {
  const { values } = await readEnv(dir)
  const [database, queue, bun, git, docker, envIgnored] = await Promise.all([
    stateOf(values.DATABASE_URL),
    stateOf(values.VALKEY_URL),
    probeCommand('bun'),
    probeCommand('git'),
    probeCommand('docker'),
    envIsIgnored(dir),
  ])

  return {
    dir,
    needsWorker: hasWorker(dir),
    database,
    queue,
    tools: { bun, git, docker },
    platform: process.platform,
    envIgnored,
  }
}

/** What is still missing before the application can start. */
export const missingServices = (report: SetupReport): Array<'database' | 'queue'> => [
  ...(report.database.reachable ? [] : ['database' as const]),
  ...(report.needsWorker && !report.queue.reachable ? ['queue' as const] : []),
]

const dockerPostgres = (port: number): string =>
  `docker run -d --name viable-postgres -e POSTGRES_PASSWORD=viable -e POSTGRES_USER=viable`
  + ` -e POSTGRES_DB=viable -p ${port}:5432 postgres:16-alpine`

const dockerValkey = (port: number): string =>
  `docker run -d --name viable-valkey -p ${port}:6379 valkey/valkey:8-alpine`

const nativeInstall = (platform: NodeJS.Platform): string[] =>
  platform === 'darwin'
    ? ['  brew install postgresql@16 && brew services start postgresql@16',
       '  brew install valkey && brew services start valkey']
    : platform === 'win32'
      ? ['  winget install PostgreSQL.PostgreSQL',
         '  (a queue store is easiest through Docker Desktop on Windows)']
      : ['  sudo apt install postgresql redis-server   # Debian/Ubuntu',
         '  sudo systemctl enable --now postgresql redis-server']

/**
 * The answer a parent agent reads when the project cannot run yet.
 *
 * It is written as a QUESTION with three answers, because which one is right is the user's to
 * decide and nobody else's: they may already run Postgres, they may want one installed here, or
 * they may prefer a hosted free tier and never install anything. Guessing means either a container
 * on somebody's machine they did not ask for, or a connection string invented for a database that
 * does not exist — and the second surfaces minutes later as a boot error nobody can place.
 */
export const renderSetupGuide = (report: SetupReport): string => {
  const missing = missingServices(report)
  const lines: string[] = [`Project: ${report.dir}`, '']

  lines.push('What this machine provides:')
  lines.push(`  bun      ${report.tools.bun ? 'yes' : 'NO — install it from https://bun.sh'}`)
  lines.push(`  git      ${report.tools.git ? 'yes' : 'NO — the project keeps its own history'}`)
  lines.push(`  database ${report.database.reachable
    ? `yes — ${report.database.redacted ?? 'configured'}`
    : report.database.configured
      ? `configured but NOT answering — ${report.database.redacted ?? ''}`
      : 'not configured'}`)
  lines.push(`  queue    ${report.needsWorker
    ? report.queue.reachable
      ? `yes — ${report.queue.redacted ?? 'configured'}`
      : report.queue.configured ? 'configured but NOT answering' : 'not configured'
    : 'not needed — this project has no background worker'}`)
  lines.push('')

  if (missing.length < 1) {
    lines.push('Everything the application needs is in place. Call run_local to build and start it.')

    return lines.join('\n')
  }

  const what = missing.map(one => one === 'database' ? 'a Postgres database' : 'a queue store (Valkey or Redis)')
  lines.push(
    `ASK THE USER — this project still needs ${what.join(' and ')}, and only they can say how to`,
    'provide it. Put these three choices to them in your own words and wait for an answer:',
    '',
    '  1. "I already have one"  — running here, on another machine, or a service you already pay',
    '     for. Ask for the connection string and nothing else.',
    '  2. "Install one here"    — the commands are below; run them only if they choose this.',
    '  3. "Use a free hosted plan" — Supabase or Neon for Postgres, Upstash for Redis. They sign',
    '     up, create a project, and copy the connection string.',
    '',
    'Then call set_local_service with what they gave you. Do not invent a connection string, and do',
    'not install anything before they have chosen.',
    '',
  )

  if (missing.includes('database')) {
    lines.push('--- 2. Install Postgres here ---')
    lines.push(report.tools.docker
      ? `  ${dockerPostgres(5432)}`
      : '  Docker is not installed. Either install Docker, or use the native package:')
    if (!report.tools.docker) lines.push(nativeInstall(report.platform)[0])
    lines.push(
      '  Then the connection string is:',
      '    postgres://viable:viable@localhost:5432/viable',
      '',
      '--- 3. Free hosted Postgres ---',
      '  Supabase: https://supabase.com → New project → Settings → Database → Connection string',
      '            (choose the "URI" form; it already carries the password)',
      '  Neon:     https://neon.tech → New project → Connection string',
      '  Either gives a `postgres://…` URL that goes straight into set_local_service.',
      '',
    )
  }

  if (missing.includes('queue')) {
    lines.push('--- A queue store, for this project\'s worker ---')
    lines.push(report.tools.docker
      ? `  ${dockerValkey(6379)}`
      : nativeInstall(report.platform)[1])
    lines.push(
      '  Then: redis://localhost:6379',
      '  Free hosted: https://upstash.com → Redis → Create database → copy the `redis://…` URL.',
      '',
    )
  }

  lines.push(
    '--- Where the value goes ---',
    `  Into ${p.join(report.dir, ROOT_ENV_FILE)}, OUTSIDE the block marked "viable:managed".`,
    '  set_local_service writes it there for you. The platform never overwrites a key you set,',
    '  and the credential never reaches the project marker, your agent\'s configuration, or the',
    '  platform.',
    report.envIgnored
      ? '  That file is git-ignored, so the credential stays out of the project\'s history.'
      : '  WARNING: .env is NOT git-ignored in this project. Say so before writing a credential.',
  )

  return lines.join('\n')
}

/**
 * Write the user's own service lines into their half of the `.env`.
 *
 * Replaces the key where it already exists outside the managed block and appends it otherwise, so
 * running this twice leaves one line rather than two — a `.env` takes the LAST assignment, and two
 * copies of a credential is one of them being quietly ignored.
 */
export const setUserEnv = async (
  dir: string, values: Record<string, string>
): Promise<{ written: string[], file: string }> => {
  const file = p.join(dir, ROOT_ENV_FILE)
  const existing = await fs.readFile(file, 'utf-8').catch(() => '')
  const lines = existing === '' ? [] : existing.split('\n')
  const written: string[] = []

  for (const [key, value] of Object.entries(values)) {
    if (value.trim() === '') continue
    written.push(key)

    const line = `${key}=${value}`
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`)

    // Walked with the block's boundaries in hand, because only a line the USER owns may be
    // rewritten: one inside the managed block belongs to the platform, which composes its half
    // whole on every push.
    let inside = false
    let replaced = false
    for (let i = 0; i < lines.length; ++i) {
      if (lines[i].trim() === CONNECT_ENV_BEGIN) { inside = true; continue }
      if (lines[i].trim() === CONNECT_ENV_END) { inside = false; continue }
      if (inside || !pattern.test(lines[i])) continue
      lines[i] = line
      replaced = true
      break
    }

    // Appended AFTER the block when it is new. A `.env` takes the last assignment, so a value the
    // user set outranks the platform's placeholder wherever the block happens to sit.
    if (!replaced) {
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      lines.push(line)
    }
  }

  // Nothing to say, nothing to write: rewriting the file for an empty call would rewrite its
  // trailing whitespace and show up as a change nobody made.
  if (written.length < 1) return { written, file }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const next = lines.length > 0 ? `${lines.join('\n')}\n` : ''
  if (next !== existing) {
    await fs.ensureDir(p.dirname(file))
    await fs.writeFile(file, next)
  }

  return { written, file }
}
