import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import { ENV_CREDENTIALS_FILE } from '@owlmeans/cli-auth'
import { DEFAULT_API_URL, DEFAULT_LLM, DEFAULT_TARGET, readConfig } from '../src/config.js'

const argv = (...args: string[]): string[] => ['node', 'bin.js', ...args]

/** A credentials file path this test's process could not possibly have written anything real to —
 * `readConfig` now reads `~/.owlmeans` by default, and a test must never touch that real file. */
const NO_FILE = '/nonexistent-viable-mcp-test-path/.owlmeans'
const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ [ENV_CREDENTIALS_FILE]: NO_FILE, ...extra })

describe('@owlmeans/viable-mcp — how the server is configured', () => {
  test('the default mode is the project here, the models paid for by the platform', async () => {
    const cfg = await readConfig(argv(), env({ VIABLE_API_TOKEN: 'vib_x' }))

    expect(cfg.target).toBe(DEFAULT_TARGET)
    expect(cfg.target).toBe(ConnectTarget.Local)
    expect(cfg.llm).toBe(DEFAULT_LLM)
    expect(cfg.llm).toBe(ConnectLlm.Cloud)
    expect(cfg.apiUrl).toBe(DEFAULT_API_URL)
  })

  test('the token comes from the environment (or the file) and never from a flag', async () => {
    // Never from a flag: a command line is readable by every process on the machine and lands in
    // shell history, and a credential that leaks that way leaks silently.
    const cfg = await readConfig(argv('--token', 'vib_from_argv'), env({ VIABLE_API_TOKEN: 'vib_from_env' }))

    expect(cfg.token).toBe('vib_from_env')
  })

  test('a flag beats the environment, and both beat the default', async () => {
    const cfg = await readConfig(argv('--llm', 'local', '--api-url', 'http://localhost:8080'), env({
      VIABLE_API_TOKEN: 'vib_x', VIABLE_LLM: 'cloud', VIABLE_TARGET: 'cloud',
    }))

    expect(cfg.llm).toBe(ConnectLlm.Local)
    expect(cfg.target).toBe(ConnectTarget.Cloud)
    expect(cfg.apiUrl).toBe('http://localhost:8080')
  })

  test('an unknown value falls back rather than starting in a mode nobody named', async () => {
    const cfg = await readConfig(argv('--target', 'sideways'), env({ VIABLE_API_TOKEN: 'vib_x' }))

    expect(cfg.target).toBe(DEFAULT_TARGET)
  })

  test('both spellings of a flag work, because both are in the wild', async () => {
    expect((await readConfig(argv('--harness=codex'), env())).harness).toBe(ConnectHarness.Codex)
    expect((await readConfig(argv('--harness', 'codex'), env())).harness).toBe(ConnectHarness.Codex)
  })

  test('the project directory is absolute, whatever it was given as', async () => {
    const cfg = await readConfig(argv('--project-dir', '.'), env({ VIABLE_API_TOKEN: 'vib_x' }))

    expect(cfg.projectDir.startsWith('/')).toBe(true)
  })

  test('a missing token is left empty, so the entry point can explain it', async () => {
    expect((await readConfig(argv(), env())).token).toBe('')
  })

  test('the credentials file, when it names a token, is picked up with no environment set at all', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'viable-mcp-config-test-'))
    const path = join(dir, '.owlmeans')
    await writeFile(path, 'VIABLE_API_TOKEN=vib_from_file\n')

    const cfg = await readConfig(argv(), { [ENV_CREDENTIALS_FILE]: path })
    expect(cfg.token).toBe('vib_from_file')

    const { rm } = await import('node:fs/promises')
    await rm(dir, { recursive: true, force: true })
  })

  test('an empty environment value does not shadow a real token in the file', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'viable-mcp-config-test-'))
    const path = join(dir, '.owlmeans')
    await writeFile(path, 'VIABLE_API_TOKEN=vib_from_file\n')

    const cfg = await readConfig(argv(), { [ENV_CREDENTIALS_FILE]: path, VIABLE_API_TOKEN: '' })
    expect(cfg.token).toBe('vib_from_file')

    await rm(dir, { recursive: true, force: true })
  })

  test('the /mcp URL defaults to the production platform', async () => {
    expect((await readConfig(argv(), env())).mcpUrl).toBe('https://api.owlmeans.com/mcp')
  })

  test('the /mcp URL is overridden by the environment', async () => {
    const cfg = await readConfig(argv(), env({ VIABLE_MCP_URL: 'http://localhost:9000/mcp' }))
    expect(cfg.mcpUrl).toBe('http://localhost:9000/mcp')
  })

  test('the /mcp URL is overridden by the credentials file, and the environment wins over it', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'viable-mcp-config-test-'))
    const path = join(dir, '.owlmeans')
    await writeFile(path, 'VIABLE_MCP_URL=http://from-file.example/mcp\n')

    expect((await readConfig(argv(), { [ENV_CREDENTIALS_FILE]: path })).mcpUrl).toBe('http://from-file.example/mcp')
    expect((await readConfig(argv(), { [ENV_CREDENTIALS_FILE]: path, VIABLE_MCP_URL: 'http://from-env.example/mcp' })).mcpUrl)
      .toBe('http://from-env.example/mcp')

    await rm(dir, { recursive: true, force: true })
  })
})
