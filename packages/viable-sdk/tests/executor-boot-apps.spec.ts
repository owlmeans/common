import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { SlotCommandType, SlotShellCommand } from '@owlmeans/viable-common'
import { integrityHelper, makeLocalSlotExecutor } from '../src/executor/index.js'
import { makeSplitTreeFixture } from './split-tree-fixture.js'

/**
 * The local executor boots each app of a TARGET split into apps the way the publisher does: the
 * app's own api package, its own env (port and mount from the app map) and its own health path, with
 * its own job and verdict. The trees and their tiny `dist/index.js` servers are test data.
 *
 * Each server answers ready ONLY on the health path its env names and only when it runs from its own
 * package; anything else answers a terminal failure naming what it saw, so a check aimed at the wrong
 * package, env or path fails at once instead of waiting out the ready window.
 */
const { splitTree, materialize, cleanup } = makeSplitTreeFixture('sdk-boot-apps-spec', 'viable-sdk-boot-')

/** Each app's api package and the api base its env must carry (`appMapHelper.apiBase`). */
const APIS: Record<string, { pkg: string, base: string }> = {
  main: { pkg: 'api', base: 'api' },
  admin: { pkg: 'admin-api', base: 'admin/api' },
  backoffice: { pkg: 'backoffice-api', base: 'backoffice/api' },
}

/** `checked` answers ready on its own base and health path; every other package always fails. */
const server = (pkg: string, base: string, checked: boolean): string => `
const env = process.env.BACKEND_BASE_URL ?? ''
Bun.serve({ port: Number(process.env.BACKEND_PORT), hostname: '127.0.0.1', fetch(request) {
  const at = new URL(request.url).pathname
  const ready = ${checked} && env === ${JSON.stringify(base)} && at === '/' + env + '/healtz'
  return Response.json(ready
    ? { phase: 'ready', bootId: process.env.BACKEND_BOOT_ID, db: { ok: true } }
    : { phase: 'failed', error: 'package ${pkg} asked ' + at + ' with base ' + env })
} })
`

/** A split tree whose `app` api is the only one that can come up. */
const tree = async (app: string): Promise<string> => {
  const root = await materialize(splitTree())
  await writeFile(path.join(root, '.env'), 'DATABASE_URL=postgres://boot:check@127.0.0.1:5999/boot\n')
  for (const [name, { pkg, base }] of Object.entries(APIS)) {
    await mkdir(path.join(root, 'sources', pkg, 'dist'), { recursive: true })
    await writeFile(path.join(root, 'sources', pkg, 'dist', 'index.js'), server(pkg, base, name === app))
  }

  return root
}

/** Starts a check through the public command, then reads its verdict the way the agent's shell polls it. */
const boot = async (root: string, app?: string): Promise<{ result: string | null, phase: string | null }> => {
  const executor = makeLocalSlotExecutor(root)
  const args = { skipBuild: true, ...(app != null ? { app } : {}) }
  const started = await executor.execute({ type: SlotCommandType.Shell, command: SlotShellCommand.BootCheck, args }) as { started?: boolean }
  expect(started.started).toBe(true)
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 250))
    const status = await executor.execute({
      type: SlotCommandType.Shell, command: SlotShellCommand.BootCheckStatus, args: app != null ? { app } : {},
    }) as { done: boolean, result: string | null, phase: string | null }
    if (status.done) return { result: status.result, phase: status.phase }
  }
}

beforeEach(() => { integrityHelper.forgetIntegrity() })
afterAll(async () => { await cleanup() })

describe('viable-sdk — the local boot check of a tree split into apps', () => {
  test('main boots from sources/api on /api/healtz — the one-app path, unchanged', async () => {
    expect(await boot(await tree('main'))).toEqual({ result: null, phase: 'ready' })
  }, 60_000)

  test('another app boots from its own api package with its own base and health path, never main\'s', async () => {
    expect(await boot(await tree('admin'), 'admin')).toEqual({ result: null, phase: 'ready' })
    // The same tree checked as main reaches only main's package, which cannot come up here.
    const asMain = await boot(await tree('admin'))
    expect(asMain.phase).toBe('boot')
    expect(asMain.result).toContain('package api asked /api/healtz with base api')
  }, 90_000)

  test('a verdict belongs to its app: another app\'s status reads its own job', async () => {
    const root = await tree('backoffice')
    expect(await boot(root, 'backoffice')).toEqual({ result: null, phase: 'ready' })

    const executor = makeLocalSlotExecutor(root)
    const main = await executor.execute({ type: SlotCommandType.Shell, command: SlotShellCommand.BootCheckStatus, args: {} }) as { done: boolean, running: boolean }
    // Nothing started main's check in this tree, so its job has no verdict to report.
    expect(main).toMatchObject({ running: false, done: false })
  }, 60_000)
})
