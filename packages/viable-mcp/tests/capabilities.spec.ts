import { describe, expect, test } from 'bun:test'
import { ConnectExecutor, ConnectHarness } from '@owlmeans/viable-common'
import { sessionCapabilities } from '../src/capabilities.js'
import { readConfig } from '../src/config.js'

/**
 * Built from a real configuration rather than a literal, so a flag that stops reaching the
 * capabilities is caught here too — the two are one decision as far as the platform is concerned.
 */
const capsOf = (...args: string[]): ReturnType<typeof sessionCapabilities> =>
  sessionCapabilities(readConfig(['node', 'bin.js', ...args], { VIABLE_API_TOKEN: 'vib_x' }))

const DISK = [ConnectExecutor.Files, ConnectExecutor.Shell, ConnectExecutor.Git]
const ALWAYS = [ConnectExecutor.Model, ConnectExecutor.Human]

/** Order is not part of the contract; the SET is. */
const sorted = (executors: ConnectExecutor[]): ConnectExecutor[] => [...executors].sort()

const executorsOf = (...args: string[]): ConnectExecutor[] => sorted(capsOf(...args).executors)

const MODES: string[][] = [
  ['--target', 'local', '--llm', 'cloud'],
  ['--target', 'local', '--llm', 'local'],
  ['--target', 'cloud', '--llm', 'cloud'],
  ['--target', 'cloud', '--llm', 'local'],
]

describe('@owlmeans/viable-mcp — what this connector says it can do', () => {
  test('each of the four modes advertises exactly its own set', () => {
    // Closed sets rather than containment: an executor claimed by mistake is an operation queued
    // for a connector that will never answer it, which containment checks cannot catch.
    expect(executorsOf('--target', 'local', '--llm', 'cloud')).toEqual(sorted([...DISK, ...ALWAYS]))
    expect(executorsOf('--target', 'local', '--llm', 'local')).toEqual(sorted([...DISK, ...ALWAYS]))
    expect(executorsOf('--target', 'cloud', '--llm', 'cloud')).toEqual(sorted(ALWAYS))
    expect(executorsOf('--target', 'cloud', '--llm', 'local')).toEqual(sorted(ALWAYS))
  })

  test('a model and a person can be reached in every mode', () => {
    // Unconditional on purpose. A coding agent is a model with a person in front of it whatever it
    // was started with — a run that finds no `human` executor assumes an answer instead of asking
    // for one, and a `model` executor gated on the delegated mode made the converter's own floor
    // unreachable for an ordinary session, moving every conversion onto the platform's models.
    for (const mode of MODES) {
      const executors = capsOf(...mode).executors
      expect(executors).toContain(ConnectExecutor.Human)
      expect(executors).toContain(ConnectExecutor.Model)
    }
  })

  test('the disk executors follow the target', () => {
    const local = capsOf('--target', 'local').executors
    const cloud = capsOf('--target', 'cloud', '--llm', 'local').executors

    for (const executor of DISK) {
      expect(local).toContain(executor)
      // A cloud project's files are not on this machine — claiming them queues operations here
      // that nothing can answer.
      expect(cloud).not.toContain(executor)
    }
  })

  test('the parent is described as configured, and its tiers are left unstated', () => {
    const caps = capsOf('--harness', 'codex')

    expect(caps.harness).toBe(ConnectHarness.Codex)
    expect(caps.subagents).toBe(true)
    expect(caps.effortControl).toBe(true)
    // A tier's entry is the parent's own name for the model it runs that tier on. Nothing on this
    // side knows it, and a guess would be displayed to the user as fact — which is also why no
    // platform-side decision may key on it: it is empty on every session this server opens.
    expect(caps.tiers).toEqual({})
  })
})
