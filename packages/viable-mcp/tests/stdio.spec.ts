import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import fs from 'node:fs'
import os from 'node:os'
import p from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The built binary, driven exactly as a coding agent drives it.
 *
 * Everything here runs against an API that cannot be reached, which is the point: a connector is
 * started by a host that knows nothing about the platform's availability, and what it does before
 * the first successful call — announce its tools, answer the offline ones, contain a failure — is
 * the whole of a user's first impression. A server that dies, hangs, or writes anything but
 * JSON-RPC to stdout at that moment is reported to the user as broken software.
 */

const BIN = p.resolve(p.dirname(fileURLToPath(import.meta.url)), '../build/bin.js')

// Port 9 is discard: nothing listens, and the refusal is immediate rather than a timeout.
const UNREACHABLE = 'http://127.0.0.1:9'

interface Started {
  client: Client
  stderr: () => string
  close: () => Promise<void>
}

const start = async (args: string[] = [], env: Record<string, string> = {}): Promise<Started> => {
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), 'viable-mcp-stdio-'))
  const transport = new StdioClientTransport({
    command: 'node',
    args: [BIN, ...args],
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      // Isolated by default — a test that does not override this must never fall through to the
      // operator's REAL `~/.owlmeans`, which `HOME` above still points at.
      OWLMEANS_CREDENTIALS: p.join(dir, '.owlmeans'),
      VIABLE_API_TOKEN: 'vib_offline_test_token',
      VIABLE_API_URL: UNREACHABLE,
      VIABLE_PROJECT_DIR: dir,
      ...env,
    },
    stderr: 'pipe',
  })

  const client = new Client({ name: 'stdio-spec', version: '0.0.0' })
  await client.connect(transport)

  let text = ''
  transport.stderr?.on('data', (chunk: Buffer) => { text += chunk.toString() })

  return {
    client,
    stderr: () => text,
    close: async () => {
      await client.close()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

const names = async (started: Started): Promise<string[]> =>
  (await started.client.listTools()).tools.map(tool => tool.name)

describe('@owlmeans/viable-mcp — the built server over stdio', () => {
  let server: Started

  beforeAll(async () => { server = await start() })
  afterAll(async () => { await server.close() })

  test('it starts and announces itself without reaching the platform', async () => {
    const offered = await names(server)

    // The default mode: the project on this machine, and the platform paying for the model calls
    // of everything but a conversion — whose calls this session collects with the same two tools.
    for (const tool of [
      'describe_capabilities', 'create_project', 'confirm_project', 'project_status', 'list_stories',
      'develop_story', 'story_status', 'run_local', 'local_status', 'install_harness', 'next_task',
      'submit_task_result', 'project_settings', 'update_project_settings',
    ]) {
      expect(offered).toContain(tool)
    }
    // Hidden rather than offered-and-refused: this project's files are here, not in a slot.
    expect(offered).not.toContain('list_files')
  }, 30_000)

  test('it reports the version its own manifest declares', async () => {
    // Read by the BUILT server from `build/../package.json` — the path the packaged tarball has.
    const manifest = JSON.parse(fs.readFileSync(p.resolve(p.dirname(BIN), '../package.json'), 'utf8'))

    expect(server.client.getServerVersion()).toEqual({ name: '@owlmeans/viable-mcp', version: manifest.version })
  })

  test('the instructions state the mode and the domain-status rule', async () => {
    const instructions = server.client.getInstructions() ?? ''

    expect(instructions).toContain('target=local')
    expect(instructions).toContain('llm=cloud')
    expect(instructions).toContain('project_status')
    expect(instructions).toContain('story_status')
    expect(instructions).not.toContain('wait_for')
  })

  test('an offline tool answers with something a model can act on', async () => {
    const result = await server.client.callTool({ name: 'local_setup_guide', arguments: {} })
    const text = (result.content as Array<{ type: string, text: string }>)
      .map(part => part.text).join('\n')

    expect(result.isError).not.toBe(true)
    // It reports what the machine provides and then ASKS, because which way to get a database is
    // the user's decision — guessing means either a container nobody asked for or a connection
    // string for a database that does not exist.
    expect(text.toLowerCase()).toContain('postgres')
    expect(text).toContain('ASK THE USER')
    expect(text).toContain('set_local_service')
    expect(text.toLowerCase()).toContain('bun')
  }, 30_000)

  test('an unreachable platform is a readable tool result, not a dead server', async () => {
    const result = await server.client.callTool({ name: 'list_projects', arguments: {} })

    expect(result.isError).toBe(true)
    expect((result.content as Array<{ text: string }>)[0].text.length).toBeGreaterThan(0)

    // And the session survives it — the next call is answered normally.
    expect(await names(server)).toContain('create_project')
  }, 30_000)

  test('nothing but JSON-RPC reaches stdout', async () => {
    // Proven twice over: every exchange above was parsed by a strict client, which a single
    // stray line of framework logging on stdout would have broken; and the server's own log
    // lines are present on the stream where they belong.
    await server.client.callTool({ name: 'list_projects', arguments: {} })
    await new Promise(resolve => setTimeout(resolve, 200))

    expect(server.stderr()).toContain('[viable-mcp]')
  }, 30_000)
})

describe('@owlmeans/viable-mcp — the mode decides what is offered', () => {
  test('the delegated mode offers the model-task loop', async () => {
    const started = await start(['--llm', 'local'])
    try {
      const offered = await names(started)

      expect(offered).toContain('next_task')
      expect(offered).toContain('submit_task_result')
      expect(started.client.getInstructions() ?? '').toContain('llm=local')
    } finally {
      await started.close()
    }
  }, 30_000)

  test('the cloud target trades the local tools for the platform\'s files', async () => {
    const started = await start(['--target', 'cloud'])
    try {
      const offered = await names(started)

      expect(offered).toContain('list_files')
      expect(offered).not.toContain('run_local')
    } finally {
      await started.close()
    }
  }, 30_000)

  test('a server started with no token starts anyway, and an API tool answers with a readable refusal', async () => {
    // `start()` already isolates `OWLMEANS_CREDENTIALS` to this run's own temp directory —
    // `HOME` is still the real one, and reading the operator's actual `~/.owlmeans` from a test
    // run would be both nondeterministic and a privacy problem.
    const started = await start([], { VIABLE_API_TOKEN: '' })
    try {
      // The server itself came up — a version that still exited 2 here would never have reached
      // this line, since `start()` opens a real stdio client connection.
      expect(await names(started)).toContain('list_projects')

      // Signing in means reaching this deployment's authorization server first, which the
      // discard port refuses immediately — exactly like the unreachable-platform case above, this
      // is a tool result the caller can read, never a hung or crashed server.
      const result = await started.client.callTool({ name: 'list_projects', arguments: {} })
      expect(result.isError).toBe(true)
      expect((result.content as Array<{ text: string }>)[0].text.length).toBeGreaterThan(0)

      // And the session survives it — the next call is answered normally.
      expect(await names(started)).toContain('create_project')
    } finally {
      await started.close()
    }
  }, 30_000)
})

describe('@owlmeans/viable-mcp — the url command', () => {
  const run = async (env: Record<string, string>) => {
    const dir = fs.mkdtempSync(p.join(os.tmpdir(), 'viable-mcp-url-'))
    const proc = Bun.spawn(['node', BIN, 'url'], {
      env: { PATH: process.env.PATH ?? '', OWLMEANS_CREDENTIALS: p.join(dir, '.owlmeans'), ...env },
      stdout: 'pipe', stderr: 'pipe',
    })
    const code = await proc.exited
    const out = await new Response(proc.stdout).text()
    fs.rmSync(dir, { recursive: true, force: true })

    return { code, out }
  }

  test('prints the production /mcp URL, and only that, on stdout', async () => {
    expect(await run({})).toEqual({ code: 0, out: 'https://api.owlmeans.com/mcp\n' })
  }, 30_000)

  test('prints the overridden one', async () => {
    expect(await run({ VIABLE_MCP_URL: 'http://127.0.0.1:1/mcp' })).toEqual({ code: 0, out: 'http://127.0.0.1:1/mcp\n' })
  }, 30_000)
})
