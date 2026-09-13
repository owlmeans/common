import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectOutOfCredits, ConnectTarget } from '@owlmeans/viable-common'
import { registerCatalogue } from '../src/tools/mcp.js'
import type { McpServerLike } from '../src/tools/mcp.js'
import { ToolHostKind } from '../src/tools/types.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'

const host: ToolHost = {
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Cloud,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: false,
}

/** Captures every registered tool's callback, so the test can call one directly. */
const fakeServer = (): { server: McpServerLike, run: (name: string, args: object) => Promise<unknown> } => {
  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()
  const server: McpServerLike = {
    registerTool: (name, _config, cb) => { callbacks.set(name, cb) },
  }
  return {
    server,
    run: async (name, args) => {
      const cb = callbacks.get(name)
      if (cb == null) throw new Error(`no tool ${name}`)
      return await cb(args)
    },
  }
}

describe('viable-sdk — an out-of-credits refusal, at the MCP boundary', () => {
  test('is phrased for the model and pushed through notify, never left as the raw marker', async () => {
    const url = 'https://vib-stage.owlmeans.org/?top-up=create'
    const notified: Array<[string, string]> = []
    const deps: ToolDeps = {
      host,
      api: {
        project: {
          create: async () => { throw new ConnectOutOfCredits(ConnectOutOfCredits.encode('create', 2, 0.5, url)) },
        },
      },
      session: async () => ({} as never),
      currentSession: () => null,
      attached: () => null,
      attach: () => undefined,
      log: () => undefined,
      notify: (level, text) => { notified.push([level, text]) },
    } as unknown as ToolDeps

    const { server, run } = fakeServer()
    registerCatalogue(server, deps)

    const result = await run('create_project', { prompt: 'a store finder' }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).not.toContain('out-of-credits:')
    expect(result.content[0]!.text).toContain('$2.00')
    expect(result.content[0]!.text).toContain('$0.50')
    expect(result.content[0]!.text).toContain(url)

    expect(notified).toHaveLength(1)
    expect(notified[0]![0]).toBe('warning')
    expect(notified[0]![1]).toBe(result.content[0]!.text)
  })

  test('an ordinary error is reported as its own message, and never notified', async () => {
    const notified: unknown[] = []
    const deps: ToolDeps = {
      host,
      api: {
        project: {
          create: async () => { throw new Error('platform unreachable') },
        },
      },
      session: async () => ({} as never),
      currentSession: () => null,
      attached: () => null,
      attach: () => undefined,
      log: () => undefined,
      notify: (...args) => { notified.push(args) },
    } as unknown as ToolDeps

    const { server, run } = fakeServer()
    registerCatalogue(server, deps)

    const result = await run('create_project', { prompt: 'a store finder' }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe('platform unreachable')
    expect(notified).toHaveLength(0)
  })
})
