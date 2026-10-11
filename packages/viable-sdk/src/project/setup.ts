import fs from 'fs-extra'
import p from 'node:path'
import { spawn } from 'node:child_process'

import { makeLayoutHelper } from '../executor/layout.js'
import { CONNECT_ENV_BEGIN, CONNECT_ENV_END } from '@owlmeans/viable-common'

import { makeProjectEnvHelper } from './env.js'
import { probeHelper } from './probe.js'
import { ROOT_ENV_FILE } from './consts.js'
import type { ServiceState, SetupReport } from './types.js'
import type { SetupHelper, SetUserEnvResult } from './setup/types.js'

/**
 * What a project needs before it can run here, and what this machine already provides.
 *
 * The platform provisions nothing on somebody's own computer: a database and, for a project with a
 * background worker, a queue store are the two things it cannot supply and cannot guess. So the
 * connector's responsibility is to find out what is already there, and where nothing is, to ASK — never to
 * install something on a person's machine on its own initiative, and never to invent a connection
 * string and let the failure surface later as a boot error nobody can place.
 */

export const createSetupHelper = (): SetupHelper => {
  const redactUrl = (url: string): string => {
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

  const probeCommand = async (command: string): Promise<boolean> =>
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
      reachable: configured ? await probeHelper.probeUrl(url) : false,
      ...(configured ? { redacted: redactUrl(url!) } : {}),
    }
  }

  /** Whether the project's own `.env` is kept out of its history — it holds credentials. */
  const envIsIgnored = async (dir: string): Promise<boolean> => {
    const ignore = await fs.readFile(p.join(dir, '.gitignore'), 'utf-8').catch(() => '')

    return /^\s*\.env\s*$/m.test(ignore) || /^\s*\*\.env\s*$/m.test(ignore) || /^\s*\.env\*/m.test(ignore)
  }

  const readSetupReport = async (dir: string): Promise<SetupReport> => {
    const { values } = await makeProjectEnvHelper(dir).readEnv()
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
      needsWorker: makeLayoutHelper(dir).hasWorker(),
      database,
      queue,
      tools: { bun, git, docker },
      platform: process.platform,
      envIgnored,
    }
  }

  const setUserEnv = async (
    dir: string, values: Record<string, string>
  ): Promise<SetUserEnvResult> => {
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

  return { redactUrl, probeCommand, readSetupReport, setUserEnv }
}

export const setupHelper = createSetupHelper()
