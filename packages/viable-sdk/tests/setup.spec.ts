import { describe, expect, test } from 'bun:test'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { CONNECT_ENV_BEGIN, CONNECT_ENV_END } from '@owlmeans/viable-common'
import { missingServices, redactUrl, renderSetupGuide, setUserEnv } from '../src/project/setup.js'
import type { SetupReport } from '../src/project/setup.js'

const report = (patch: Partial<SetupReport> = {}): SetupReport => ({
  dir: '/tmp/project',
  needsWorker: false,
  database: { configured: false, reachable: false },
  queue: { configured: false, reachable: false },
  tools: { bun: true, git: true, docker: true },
  platform: 'linux',
  envIgnored: true,
  ...patch,
})

const sandbox = async (files: Record<string, string> = {}): Promise<string> => {
  const dir = await fse.mkdtemp(path.join(os.tmpdir(), 'viable-setup-'))
  for (const [name, content] of Object.entries(files)) {
    await fse.outputFile(path.join(dir, name), content)
  }

  return dir
}

describe('what the connector says when a project cannot run yet', () => {
  test('it ASKS rather than choosing for the user', () => {
    // Which way to get a database is the user's to decide: they may already run one, they may want
    // one installed here, or they may prefer a hosted tier and never install anything. Guessing
    // means either a container nobody asked for or a connection string for a database that does
    // not exist — and the second surfaces minutes later as a boot error nobody can place.
    const said = renderSetupGuide(report())

    expect(said).toContain('ASK THE USER')
    expect(said).toContain('I already have one')
    expect(said).toContain('Install one here')
    expect(said).toContain('free hosted plan')
    expect(said).toContain('set_local_service')
    expect(said).toContain('Do not invent a connection string')
  })

  test('it names a way to install and a way to sign up', () => {
    const said = renderSetupGuide(report())

    expect(said).toContain('docker run')
    expect(said).toContain('supabase.com')
  })

  test('a queue is offered only to a project that has a worker', () => {
    expect(renderSetupGuide(report())).not.toContain('upstash.com')
    expect(renderSetupGuide(report({ needsWorker: true }))).toContain('upstash.com')
    expect(renderSetupGuide(report())).toContain('no background worker')
  })

  test('without docker it names the platform package instead', () => {
    const said = renderSetupGuide(report({ tools: { bun: true, git: true, docker: false } }))

    expect(said).toContain('apt install')
    expect(said).not.toContain('docker run')
  })

  test('a configured but unreachable database is called that, not "missing"', () => {
    // The two need different answers: one is a typo or a stopped service, the other is a decision
    // nobody has made yet.
    const said = renderSetupGuide(report({
      database: { configured: true, reachable: false, redacted: 'postgres://***@db:5432/app' },
    }))

    expect(said).toContain('NOT answering')
  })

  test('with everything in place it stops asking and says what to call', () => {
    const said = renderSetupGuide(report({ database: { configured: true, reachable: true } }))

    expect(said).not.toContain('ASK THE USER')
    expect(said).toContain('run_local')
  })

  test('an unignored .env is a warning, because a credential is about to go into it', () => {
    expect(renderSetupGuide(report({ envIgnored: false }))).toContain('NOT git-ignored')
  })

  test('the platform placeholder does not count as configured', () => {
    // It is written by the platform so that a boot failure names a connection rather than a
    // missing key — it is not somebody's database.
    expect(missingServices(report())).toContain('database')
  })
})

describe('a credential never appears in full where it does not have to', () => {
  test('the user and password are removed', () => {
    expect(redactUrl('postgres://me:secret@db.example:5432/app'))
      .toBe('postgres://***@db.example:5432/app')
  })

  test('a string that is not a URL is still redacted', () => {
    expect(redactUrl('weird//me:secret@host/db')).not.toContain('secret')
  })

  test('a URL with no credentials is left alone', () => {
    expect(redactUrl('redis://localhost:6379')).toContain('localhost:6379')
  })
})

describe('where the user\'s own values are written', () => {
  test('they land outside the managed block and survive it', async () => {
    const dir = await sandbox({
      '.env': `${CONNECT_ENV_BEGIN}\nDATABASE_URL=placeholder\nOIDC_CLIENT=c\n${CONNECT_ENV_END}\n`,
    })

    await setUserEnv(dir, { DATABASE_URL: 'postgres://me@localhost:5432/mine' })
    const written = await fse.readFile(path.join(dir, '.env'), 'utf-8')

    // The platform's line is untouched — it composes its half whole on every push — and the
    // user's comes after it, which is the assignment a `.env` takes.
    expect(written).toContain('DATABASE_URL=placeholder')
    expect(written.lastIndexOf('DATABASE_URL=postgres://me@localhost:5432/mine'))
      .toBeGreaterThan(written.indexOf(CONNECT_ENV_END))
  })

  test('writing twice leaves one line, not two', async () => {
    // Two copies of a credential is one of them being quietly ignored.
    const dir = await sandbox({ '.env': 'FOO=1\n' })

    await setUserEnv(dir, { DATABASE_URL: 'postgres://a@h:5432/d' })
    await setUserEnv(dir, { DATABASE_URL: 'postgres://b@h:5432/d' })
    const written = await fse.readFile(path.join(dir, '.env'), 'utf-8')

    expect(written.split('DATABASE_URL=')).toHaveLength(2)
    expect(written).toContain('postgres://b@h:5432/d')
    expect(written).toContain('FOO=1')
  })

  test('a file that does not exist yet is created', async () => {
    const dir = await sandbox()

    const { written, file } = await setUserEnv(dir, { VALKEY_URL: 'redis://localhost:6379' })

    expect(written).toEqual(['VALKEY_URL'])
    expect(await fse.readFile(file, 'utf-8')).toContain('redis://localhost:6379')
  })

  test('an empty value writes nothing', async () => {
    const dir = await sandbox({ '.env': 'FOO=1\n' })

    const { written } = await setUserEnv(dir, { DATABASE_URL: '   ' })

    expect(written).toEqual([])
    expect(await fse.readFile(path.join(dir, '.env'), 'utf-8')).toBe('FOO=1\n')
  })
})
