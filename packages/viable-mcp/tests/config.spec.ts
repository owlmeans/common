import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import { DEFAULT_API_URL, DEFAULT_LLM, DEFAULT_TARGET, readConfig } from '../src/config.js'

const argv = (...args: string[]): string[] => ['node', 'bin.js', ...args]

describe('@owlmeans/viable-mcp — how the server is configured', () => {
  test('the default mode is the project here, the models paid for by the platform', () => {
    const cfg = readConfig(argv(), { VIABLE_API_TOKEN: 'vib_x' })

    expect(cfg.target).toBe(DEFAULT_TARGET)
    expect(cfg.target).toBe(ConnectTarget.Local)
    expect(cfg.llm).toBe(DEFAULT_LLM)
    expect(cfg.llm).toBe(ConnectLlm.Cloud)
    expect(cfg.apiUrl).toBe(DEFAULT_API_URL)
  })

  test('the token comes from the environment and from nowhere else', () => {
    // Never from a flag: a command line is readable by every process on the machine and lands in
    // shell history, and a credential that leaks that way leaks silently.
    const cfg = readConfig(argv('--token', 'vib_from_argv'), { VIABLE_API_TOKEN: 'vib_from_env' })

    expect(cfg.token).toBe('vib_from_env')
  })

  test('a flag beats the environment, and both beat the default', () => {
    const cfg = readConfig(argv('--llm', 'local', '--api-url', 'http://localhost:8080'), {
      VIABLE_API_TOKEN: 'vib_x', VIABLE_LLM: 'cloud', VIABLE_TARGET: 'cloud',
    })

    expect(cfg.llm).toBe(ConnectLlm.Local)
    expect(cfg.target).toBe(ConnectTarget.Cloud)
    expect(cfg.apiUrl).toBe('http://localhost:8080')
  })

  test('an unknown value falls back rather than starting in a mode nobody named', () => {
    const cfg = readConfig(argv('--target', 'sideways'), { VIABLE_API_TOKEN: 'vib_x' })

    expect(cfg.target).toBe(DEFAULT_TARGET)
  })

  test('both spellings of a flag work, because both are in the wild', () => {
    expect(readConfig(argv('--harness=codex'), {}).harness).toBe(ConnectHarness.Codex)
    expect(readConfig(argv('--harness', 'codex'), {}).harness).toBe(ConnectHarness.Codex)
  })

  test('the project directory is absolute, whatever it was given as', () => {
    const cfg = readConfig(argv('--project-dir', '.'), { VIABLE_API_TOKEN: 'vib_x' })

    expect(cfg.projectDir.startsWith('/')).toBe(true)
  })

  test('a missing token is left empty, so the entry point can explain it', () => {
    expect(readConfig(argv(), {}).token).toBe('')
  })
})
