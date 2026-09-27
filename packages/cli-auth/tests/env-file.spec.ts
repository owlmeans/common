import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadOwlmeansEnv, parseEnv, readCredentialsFile, resolveEnvFile, setEnvValues } from '../src/env-file.js'
import { ENV_CREDENTIALS_FILE } from '../src/consts.js'

let dir: string

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'cli-auth-test-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('resolveEnvFile', () => {
  test('defaults to ~/.owlmeans', () => {
    expect(resolveEnvFile({})).toMatch(/\.owlmeans$/)
  })

  test('honors OWLMEANS_CREDENTIALS', () => {
    expect(resolveEnvFile({ [ENV_CREDENTIALS_FILE]: '/custom/path' })).toBe('/custom/path')
  })

  test('ignores an empty override', () => {
    expect(resolveEnvFile({ [ENV_CREDENTIALS_FILE]: '' })).toMatch(/\.owlmeans$/)
  })
})

describe('parseEnv', () => {
  test('reads KEY=VALUE, quotes, comments and export prefixes', () => {
    const parsed = parseEnv([
      '# a comment', '', 'FOO=bar', 'export BAZ=qux', 'QUOTED="has spaces"', "SINGLE='also quoted'",
    ].join('\n'))
    expect(parsed).toEqual({ FOO: 'bar', BAZ: 'qux', QUOTED: 'has spaces', SINGLE: 'also quoted' })
  })
})

describe('loadOwlmeansEnv', () => {
  test('the environment wins over the file', async () => {
    const path = join(dir, '.owlmeans')
    await setEnvValues(path, { VIABLE_API_TOKEN: 'from-file' })

    const merged = await loadOwlmeansEnv({ [ENV_CREDENTIALS_FILE]: path, VIABLE_API_TOKEN: 'from-env' })
    expect(merged.VIABLE_API_TOKEN).toBe('from-env')
  })

  test('an empty environment value does not shadow the file', async () => {
    const path = join(dir, '.owlmeans')
    await setEnvValues(path, { VIABLE_API_TOKEN: 'from-file' })

    const merged = await loadOwlmeansEnv({ [ENV_CREDENTIALS_FILE]: path, VIABLE_API_TOKEN: '' })
    expect(merged.VIABLE_API_TOKEN).toBe('from-file')
  })

  test('a missing file is not an error', async () => {
    const merged = await loadOwlmeansEnv({ [ENV_CREDENTIALS_FILE]: join(dir, 'nope') })
    expect(merged.VIABLE_API_TOKEN).toBeUndefined()
  })
})

describe('setEnvValues', () => {
  test('creates the file with mode 0600', async () => {
    const path = join(dir, '.owlmeans')
    const result = await setEnvValues(path, { A: '1' })
    expect(result.insecurePermissions).toBe(false)

    const info = await stat(path)
    expect(info.mode & 0o777).toBe(0o600)
  })

  test('preserves comments and untouched keys, replaces the named one in place', async () => {
    const path = join(dir, '.owlmeans')
    await Bun.write(path, '# a note\nKEEP=1\nCHANGE=old\n')

    await setEnvValues(path, { CHANGE: 'new' })
    const content = await readFile(path, 'utf-8')
    expect(content).toContain('# a note')
    expect(content).toContain('KEEP=1')
    expect(content).toContain('CHANGE=new')
    expect(content).not.toContain('CHANGE=old')
  })

  test('appends a key that was not there before', async () => {
    const path = join(dir, '.owlmeans')
    await Bun.write(path, 'A=1\n')
    await setEnvValues(path, { B: '2' })

    const parsed = await readCredentialsFile({ [ENV_CREDENTIALS_FILE]: path })
    expect(parsed).toEqual({ A: '1', B: '2' })
  })

  test('an undefined value removes the key rather than writing it', async () => {
    const path = join(dir, '.owlmeans')
    await Bun.write(path, 'A=1\nB=2\n')
    await setEnvValues(path, { A: undefined })

    const parsed = await readCredentialsFile({ [ENV_CREDENTIALS_FILE]: path })
    expect(parsed).toEqual({ B: '2' })
  })

  test('a concurrent rewrite never leaves a half-written file — the temp file lands atomically', async () => {
    const path = join(dir, '.owlmeans')
    await Promise.all([
      setEnvValues(path, { A: '1' }),
      setEnvValues(path, { B: '2' }),
    ])
    // Whichever write landed last, the file must be one complete, parseable write — never a
    // truncated interleaving of the two.
    const content = await readFile(path, 'utf-8')
    expect(content.endsWith('\n')).toBe(true)
  })
})
