import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  SlotCommandType, SlotShellCommand, SubProject, TargetLayout, targetIntegrityHelper,
  targetLayoutHelper, type SlotShellResult, type TargetFileMap,
} from '@owlmeans/viable-common'
import { makeLocalSlotExecutor } from '../src/executor/index.js'

describe('viable-sdk — local Bun command environment', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'viable-sdk-shell-'))
    const manifest = targetLayoutHelper.targetManifest(TargetLayout.V2)
    const slug = 'sdk-shell-spec'
    const files: TargetFileMap = Object.fromEntries(manifest.files.map(file => [file, file.endsWith('.json') ? '{}' : '']))
    for (const [file, markers] of Object.entries(manifest.markers)) files[file] = markers.join('\n')
    files['package.json'] = JSON.stringify({ name: slug, type: 'module', workspaces: manifest.workspaceEntries })
    for (const pkg of manifest.packages) {
      files[`${manifest.dir}/${pkg}/package.json`] = JSON.stringify({
        name: targetLayoutHelper.targetPackageName(slug, pkg), type: 'module',
        scripts: { build: manifest.buildScripts[pkg] },
        dependencies: Object.fromEntries(targetLayoutHelper.targetRequiredDeps(slug, pkg, TargetLayout.V2)
          .map(dep => [dep, '1.0.0'])),
      })
    }
    expect(targetIntegrityHelper.verifyTargetShape(files).violations).toEqual([])
    for (const [file, code] of Object.entries(files)) {
      const destination = path.join(root, file)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, code ?? '')
    }
  })

  afterAll(async () => { if (root != null) await rm(root, { recursive: true, force: true }) })

  test('forwards smoke input through the public slot command into the selected package', async () => {
    const input = { value: 'local value with spaces and $VARIABLE', mode: 'discover' }
    const key = 'VIABLE_SMOKE_INPUT_0'
    const before = process.env[key]
    const result = await makeLocalSlotExecutor(root).execute({
      type: SlotCommandType.Shell, command: SlotShellCommand.Bun,
      args: {
        args: `-e 'process.stdout.write(JSON.stringify({input: JSON.parse(Buffer.from(process.env.VIABLE_SMOKE_INPUT_0, "base64").toString()), cwd: process.cwd(), inherited: Boolean(process.env.PATH)})); process.exit(17)'`,
        options: { subproject: SubProject.Api, env: { [key]: Buffer.from(JSON.stringify(input)).toString('base64') } },
      },
    }) as SlotShellResult

    expect(result.result).toContain(JSON.stringify({ input, cwd: path.join(root, 'sources/api'), inherited: true }))
    expect(result.result).toContain('exit 17:')
    expect(process.env[key]).toBe(before)
  })

  test('keeps the inherited environment when command options omit env', async () => {
    const result = await makeLocalSlotExecutor(root).execute({
      type: SlotCommandType.Shell, command: SlotShellCommand.Bun,
      args: { args: `-e 'process.exit(process.env.PATH ? 0 : 1)'`, options: { subproject: SubProject.Api } },
    }) as SlotShellResult

    expect(result.result).toBeNull()
  })
})
