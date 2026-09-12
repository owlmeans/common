import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffold } from '../src/index.js'

const dir = mkdtempSync(join(tmpdir(), 'owlmeans-create-app-full-'))

scaffold({
  dir,
  slug: 'protocol-app',
  name: 'Protocol App',
  lang: 'en',
  description: 'A protocol-first application.',
})

const read = (rel: string): string => readFileSync(join(dir, rel), 'utf8')

afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

describe('create-app — full entrypoint scaffolding', () => {
  test('keeps shared declarations immutable and binds handlers locally', () => {
    const common = read('sources/common/src/entrypoints.ts')
    const api = read('sources/api/src/entrypoints.ts')

    expect(common).toContain('export const session = {')
    expect(common).toContain('export const appProtocols = {')
    expect(common).not.toContain('appEntrypoints')
    expect(common).not.toContain('sessionEntrypoints = protocols(')
    expect(api).toContain("import { bind } from '@owlmeans/server-entrypoint'")
    expect(api).toContain('export const appBindings = [')
    expect(api).not.toContain('appEntrypoints')
    expect(api).toContain('bind(appProtocols.api.session.list, handlers.list)')
    expect(api).toContain('bind(appProtocols.api.session.add, handlers.add)')
    expect(api).toContain('bind(appProtocols.api.session.remove, handlers.remove)')
    expect(api).not.toContain('bindAll(sessionEntrypoints')
  })

  test('uses one immutable browser binding list', () => {
    const web = read('sources/web/src/entrypoints.ts')

    expect(web).toContain('export const appBindings = [')
    expect(web).not.toContain('appEntrypoints')
    expect(web).toContain('...bindAll(appProtocols.api),')
    expect(web).toContain('bindScreen(appProtocols.web.session, handler(SessionScreen))')
    expect(web).not.toContain('entrypoints.push(')
  })
})
