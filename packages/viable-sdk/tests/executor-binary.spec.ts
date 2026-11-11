import { afterEach, describe, expect, test } from 'bun:test'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

import { SLOT_BINARY_MAX_BASE64_CHARS, SLOT_BINARY_MAX_BYTES, SlotCommandType, SlotFileCommand } from '@owlmeans/viable-common'

import { FileCommandRefused, SandboxPathError } from '../src/executor/errors.js'
import { createLocalFileHelper } from '../src/executor/files.js'
import { makeLocalSlotExecutor } from '../src/executor/index.js'

/**
 * The binary pair of the local executor — `WriteBinaryFile` and `ReadBinaryFile` — against real trees.
 *
 * The publisher answers both in a slot; the connector must answer them on a laptop with the same
 * shapes (`{}` and `{ base64, size }`), the same ceiling and the same confinement, because the
 * agent's remote helper and file-streams' workload source parse the answer without knowing which
 * executor produced it.
 *
 * Platform vs target: everything built here is a TARGET project (test data).
 */
describe('viable-sdk — local binary files', () => {
  const roots: string[] = []

  const sandbox = async (): Promise<string> => {
    const root = await fse.mkdtemp(path.join(os.tmpdir(), 'viable-sdk-binary-'))
    roots.push(root)

    return root
  }

  afterEach(async () => {
    while (roots.length > 0) await fse.remove(roots.pop() as string)
  })

  const bytes = Buffer.from([0, 255, 128, 1, 0x89, 0x50, 0x4e, 0x47])

  test('the dispatcher writes bytes and reads them back in the publisher shapes', async () => {
    const root = await sandbox()
    const executor = makeLocalSlotExecutor(root)

    expect(await executor.execute({
      type: SlotCommandType.Files, command: SlotFileCommand.WriteBinaryFile,
      args: { filePath: 'docs/materials/brand/logo.png', base64: bytes.toString('base64') },
    })).toEqual({})
    expect(await fse.readFile(path.join(root, 'docs/materials/brand/logo.png'))).toEqual(bytes)

    expect(await executor.execute({
      type: SlotCommandType.Files, command: SlotFileCommand.ReadBinaryFile,
      args: { filePath: 'docs/materials/brand/logo.png' },
    })).toEqual({ base64: bytes.toString('base64'), size: bytes.length })
    // No temporary file is left beside the written one.
    expect(await fse.readdir(path.join(root, 'docs/materials/brand'))).toEqual(['logo.png'])
  })

  test('an absolute path is re-rooted inside the project, like every other file command', async () => {
    const root = await sandbox()
    const helper = createLocalFileHelper(root)

    await helper.writeBinaryFile(path.join(root, 'a/b.bin'), bytes.toString('base64'))
    expect((await helper.readBinaryFile('a/b.bin')).size).toBe(bytes.length)
    expect((await helper.readBinaryFile(path.join(root, 'a/b.bin'))).base64).toBe(bytes.toString('base64'))
  })

  test('a path that climbs out is refused for both directions', async () => {
    const root = await sandbox()
    const helper = createLocalFileHelper(root)

    await expect(helper.writeBinaryFile('../escaped.bin', bytes.toString('base64'))).rejects.toThrow(SandboxPathError)
    await expect(helper.readBinaryFile('sources/../../etc/hostname')).rejects.toThrow(SandboxPathError)
  })

  test('a symlink resolving outside the project is refused; one inside it is read', async () => {
    const root = await sandbox()
    const outside = await sandbox()
    await fse.writeFile(path.join(outside, 'secret.key'), 'not yours')
    await fse.ensureDir(path.join(root, 'assets'))
    await fse.symlink(path.join(outside, 'secret.key'), path.join(root, 'assets/link.key'))
    await fse.writeFile(path.join(root, 'assets/real.bin'), bytes)
    await fse.symlink(path.join(root, 'assets/real.bin'), path.join(root, 'assets/inner.bin'))
    const helper = createLocalFileHelper(root)

    await expect(helper.readBinaryFile('assets/link.key')).rejects.toThrow(SandboxPathError)
    expect((await helper.readBinaryFile('assets/inner.bin')).base64).toBe(bytes.toString('base64'))
  })

  test('a directory, a missing file and a file over the ceiling are refused', async () => {
    const root = await sandbox()
    await fse.ensureDir(path.join(root, 'docs/materials'))
    const big = path.join(root, 'big.bin')
    await fse.writeFile(big, Buffer.alloc(0))
    await fse.truncate(big, SLOT_BINARY_MAX_BYTES + 1)
    const helper = createLocalFileHelper(root)

    await expect(helper.readBinaryFile('docs/materials')).rejects.toThrow(FileCommandRefused)
    await expect(helper.readBinaryFile('nope.bin')).rejects.toThrow(/ENOENT/)
    await expect(helper.readBinaryFile('big.bin')).rejects.toThrow(FileCommandRefused)

    // Exactly the ceiling still reads.
    await fse.truncate(big, SLOT_BINARY_MAX_BYTES)
    expect((await helper.readBinaryFile('big.bin')).size).toBe(SLOT_BINARY_MAX_BYTES)
  })

  test('a malformed or oversized payload is refused before anything is written', async () => {
    const root = await sandbox()
    const helper = createLocalFileHelper(root)

    await expect(helper.writeBinaryFile('a.bin', 'abc')).rejects.toThrow(FileCommandRefused)
    await expect(helper.writeBinaryFile('a.bin', 'ab$=')).rejects.toThrow(FileCommandRefused)
    await expect(helper.writeBinaryFile('a.bin', 'A'.repeat(SLOT_BINARY_MAX_BASE64_CHARS + 4))).rejects.toThrow(FileCommandRefused)
    expect(await fse.pathExists(path.join(root, 'a.bin'))).toBe(false)
  })
})
