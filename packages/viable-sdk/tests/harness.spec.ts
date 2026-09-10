import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { ConnectHarness } from '@owlmeans/viable-common'
import { describeHarness, installHarness } from '../src/harness/index.js'

const dirs: string[] = []
const tmp = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'viable-harness-'))
  dirs.push(dir)

  return dir
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await fs.remove(dir)
})

const read = async (dir: string, file: string): Promise<string> =>
  await fs.readFile(path.join(dir, file), 'utf-8')

describe('viable-sdk — setting a coding agent up', () => {
  test('Claude Code gets a low-effort subagent and the working rule', async () => {
    const dir = await tmp()
    const { written } = await installHarness(dir, ConnectHarness.ClaudeCode)

    expect(written).toContain('.claude/agents/viable-worker.md')
    const worker = await read(dir, '.claude/agents/viable-worker.md')
    expect(worker).toContain('effort: low')
    expect(worker).toContain('ONE model task')
    expect(await read(dir, 'CLAUDE.md')).toContain('next_task')
  })

  test('every harness is told the same protocol', async () => {
    for (const harness of Object.values(ConnectHarness)) {
      const files = describeHarness(harness)
      const all = files.map(file => file.content).join('\n')

      expect(all).toContain('next_task')
      expect(all).toContain('submit_task_result')
      // The isolation is the point of the whole loop; a harness told to answer inline in the main
      // conversation would poison its own context with somebody else's prompts.
      expect(all).toMatch(/CLEAN subagent|isolated/)
    }
  })

  test('installing twice changes nothing', async () => {
    const dir = await tmp()
    await installHarness(dir, ConnectHarness.ClaudeCode)
    const before = await read(dir, 'CLAUDE.md')

    const second = await installHarness(dir, ConnectHarness.ClaudeCode)

    expect(second.written).toEqual([])
    expect(await read(dir, 'CLAUDE.md')).toBe(before)
  })

  test('a section replaces only its own block, and keeps what the project wrote', async () => {
    const dir = await tmp()
    await fs.outputFile(path.join(dir, 'CLAUDE.md'), '# My project\n\nRun the tests before committing.\n')

    await installHarness(dir, ConnectHarness.ClaudeCode)
    const merged = await read(dir, 'CLAUDE.md')
    expect(merged).toContain('Run the tests before committing.')
    expect(merged).toContain('next_task')

    // A second install rewrites the block in place rather than appending a duplicate.
    await installHarness(dir, ConnectHarness.ClaudeCode)
    const again = await read(dir, 'CLAUDE.md')
    expect(again.split('viable:begin')).toHaveLength(2)
    expect(again).toContain('Run the tests before committing.')
  })

  test('the MCP entry is merged into a configuration that already has other servers', async () => {
    const dir = await tmp()
    await fs.outputJson(path.join(dir, '.mcp.json'), { mcpServers: { other: { command: 'x' } } })

    await installHarness(dir, ConnectHarness.ClaudeCode, { mcpConfig: true })

    const config = await fs.readJson(path.join(dir, '.mcp.json'))
    expect(config.mcpServers.other).toEqual({ command: 'x' })
    expect(config.mcpServers.viable.command).toBe('npx')
  })

  test('no file ever contains the token — only a reference to the variable', async () => {
    const dir = await tmp()
    for (const harness of Object.values(ConnectHarness)) {
      await installHarness(dir, harness, { mcpConfig: true })
    }

    const files = await fs.readdir(dir, { recursive: true }) as string[]
    for (const file of files) {
      const full = path.join(dir, file)
      if (!(await fs.stat(full)).isFile()) continue
      const content = await fs.readFile(full, 'utf-8')
      // A configuration that carried the secret itself would be committed by the next `git add`.
      expect(content).not.toMatch(/vib_[A-Za-z0-9]{10,}/)
    }
  })

  test('a configuration that is not valid JSON is refused rather than overwritten', async () => {
    const dir = await tmp()
    await fs.outputFile(path.join(dir, '.mcp.json'), '{ this is being edited')

    await expect(installHarness(dir, ConnectHarness.ClaudeCode, { mcpConfig: true })).rejects.toThrow()
  })

  test('the MCP entry is left alone unless it was asked for', async () => {
    const dir = await tmp()
    const { written, skipped } = await installHarness(dir, ConnectHarness.ClaudeCode)

    expect(written).not.toContain('.mcp.json')
    expect(skipped).toContain('.mcp.json')
  })
})
