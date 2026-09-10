import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { scaffold } from '../src/index.js'

const dir = mkdtempSync(join(tmpdir(), 'owlmeans-create-app-bare-'))

// The destination already exists — that is how a driving tool calls it.
scaffold({
  dir,
  slug: 'bare-app',
  name: 'Bare App',
  lang: 'pt-BR',
  description: 'A bare shell.',
  bare: true,
})

const walk = (root: string, from = root): string[] =>
  readdirSync(from).flatMap(entry => {
    const path = join(from, entry)
    return statSync(path).isDirectory()
      ? walk(root, path)
      : [relative(root, path).split(sep).join('/')]
  })

const files = walk(dir)

const read = (rel: string): string => readFileSync(join(dir, rel), 'utf8')

afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

describe('create-app — bare scaffolding', () => {
  test('substitutes every placeholder', () => {
    const left = files.filter(file => /__APP_[A-Z]+__/.test(read(file)))
    expect(left).toEqual([])
  })

  test('emits no `.bare.` variant and no bare manifest', () => {
    expect(files.filter(file => file.includes('.bare.'))).toEqual([])
    expect(files).not.toContain('_bare.json')
  })

  test('drops the session demo', () => {
    for (const gone of [
      'sources/common/src/types.ts',
      'sources/common/src/schemas.ts',
      'sources/api/src/consts.ts',
      'sources/api/src/app',
      'sources/web/src/screens/about.tsx',
      'sources/web/src/screens/session.tsx',
    ]) {
      expect(existsSync(join(dir, gone))).toBe(false)
    }
    expect(read('sources/common/src/consts.ts')).not.toContain('session')
    expect(read('sources/web/src/nav.ts')).not.toContain('Demo')
  })

  test('keeps the working shell', () => {
    for (const kept of [
      'package.json',
      'README.md',
      'AGENTS.md',
      '.gitignore',
      'sources/common/src/config.ts',
      'sources/common/src/consts.ts',
      'sources/common/src/entrypoints.ts',
      'sources/common/src/index.ts',
      'sources/api/src/config.ts',
      'sources/api/src/context.ts',
      'sources/api/src/entrypoints.ts',
      'sources/api/src/index.ts',
      'sources/api/src/types.ts',
      'sources/web/index.html',
      'sources/web/src/context.ts',
      'sources/web/src/entrypoints.ts',
      'sources/web/src/index.tsx',
      'sources/web/src/nav.ts',
      'sources/web/src/render.tsx',
      'sources/web/src/layout/main.tsx',
      'sources/web/src/screens/home.tsx',
    ]) {
      expect(existsSync(join(dir, kept))).toBe(true)
    }
  })

  test('carries the slug, name, language and description into the output', () => {
    expect(JSON.parse(read('package.json')).name).toBe('bare-app')
    expect(read('sources/common/src/consts.ts')).toContain(`'bare-app-api'`)

    const html = read('sources/web/index.html')
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('<title>Bare App</title>')
    expect(html).toContain('<meta name="description" content="A bare shell." />')
    expect(html).toContain('<meta name="application-name" content="Bare App" />')
  })

  test('leaves the shared entrypoint list empty but wired', () => {
    expect(read('sources/common/src/entrypoints.ts')).toContain('sharedEntrypoints')
    expect(read('sources/api/src/entrypoints.ts')).toContain('sharedEntrypoints')
    expect(read('sources/web/src/entrypoints.ts')).toContain('sharedEntrypoints')
  })
})
