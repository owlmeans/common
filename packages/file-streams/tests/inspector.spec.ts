import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import * as inspector from '@owlmeans/file-inspector'
import { createBufferSource, createFileInspector, FileKind, FileKindError, FileMimicryError, fileInspector } from '../src/index.js'
import { bigDocxOf, cfbOf, CLSID, ELF, PNG } from './fixtures.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { localClient } from './context.js'

describe('@owlmeans/file-streams — inspector', () => {
  let origin: Origin
  beforeAll(() => { origin = startOrigin() })
  afterAll(() => origin.stop())

  test('re-exports @owlmeans/file-inspector, and its probe reads file-streams sources as they are', async () => {
    expect([fileInspector, createFileInspector, FileKind, FileMimicryError, FileKindError])
      .toEqual([inspector.fileInspector, inspector.createFileInspector, inspector.FileKind, inspector.FileMimicryError, inspector.FileKindError])
    expect(await fileInspector.probe(createBufferSource(PNG, { name: 'dot.png' }))).toMatchObject({ status: 'match', detected: { ext: 'png' } })
    await expect(fileInspector.check(createBufferSource(ELF, { name: 'cat.png' }))).rejects.toBeInstanceOf(FileMimicryError)
  })

  test('probes remote files through ranges within the budget, and heads without them', async () => {
    origin.files.set('big.docx', { bytes: await bigDocxOf(20 * 1024 * 1024) })
    origin.files.set('deep.doc', { bytes: cfbOf(CLSID.doc, 40, 41) })
    const client = localClient()

    const ranged = await fileInspector.probe(client.source(origin.url('/files/big.docx')))
    expect(ranged).toMatchObject({ status: 'match', detected: { ext: 'docx' }, probe: { randomAccess: true } })
    expect(ranged.probe.bytesRead).toBeLessThanOrEqual(1024 * 1024)
    expect(origin.served.get('big.docx') ?? 0).toBeLessThan(2 * 1024 * 1024)

    const headOnly = await fileInspector.probe(client.source(origin.url('/norange/big.docx')))
    expect(headOnly.probe.randomAccess).toBe(false)
    expect(headOnly.status).toBe('inconclusive')
    expect(headOnly.reasons).toContain('head-only')

    const small = createFileInspector({ sampleBytes: 4096 })
    expect((await small.probe(client.source(origin.url('/files/deep.doc')))).detected?.ext).toBe('doc')
    expect((await small.probe(client.source(origin.url('/norange/deep.doc')))).reasons).toContain('head-only')
  }, 60_000)
})
