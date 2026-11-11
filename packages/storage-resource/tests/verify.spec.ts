import { beforeAll, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { FileKindError, FileMimicryError } from '@owlmeans/file-inspector'
import { FileTypeError, StorageApiError } from '@owlmeans/storage-common'
import type { StorageResource, StoredRecord } from '../src/index.js'
import { ELF, MARKDOWN, PNG, boot, streamOf, unreachableConfig } from './context.js'

const rejection = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected a rejection')
}

/**
 * Verification happens before anything is sent: against a store that refuses every connection,
 * a refused body fails with a `FileTypeError` and an accepted one only then with the store's
 * `StorageApiError`.
 */
describe('@owlmeans/storage-resource — upload verification (offline)', () => {
  let storage: StorageResource

  beforeAll(async () => {
    storage = (await boot(await unreachableConfig())).storage
  })

  const upload = (bytes: Uint8Array, claims: Pick<StoredRecord, 'type' | 'name'>, size: number = bytes.length) => {
    const stream = streamOf(bytes)
    return { stream, result: storage.create({ prefix: 'verify/file', stream, size, ...claims }) }
  }

  test('refuses a png claimed as a pdf with the mime-mismatch code, releasing the stream', async () => {
    const { stream, result } = upload(PNG, { type: 'application/pdf' })
    const error = await rejection(result)

    expect(error).toBeInstanceOf(FileTypeError)
    expect(error).toBeInstanceOf(FileMimicryError)
    expect(error.message).toBe('stored-file:type:mimicry:mime-mismatch')
    expect(stream.destroyed).toBe(true)
  })

  test('refuses another format of the same kind than the declared type, and than the name', async () => {
    for (const claims of [{ type: 'image/jpeg' }, { type: 'image/png', name: 'photo.jpg' }]) {
      const error = await rejection(upload(PNG, claims).result)
      expect([claims, error.message]).toEqual([claims, 'stored-file:type:mimicry:mime-mismatch'])
    }
  })

  test('refuses an executable, however it is claimed', async () => {
    const honest = await rejection(upload(ELF, { type: 'application/x-executable', name: 'tool' }).result)
    expect(honest).toBeInstanceOf(FileKindError)
    expect(honest).toBeInstanceOf(FileTypeError)

    const unclaimed = await rejection(upload(ELF, { type: 'application/octet-stream' }).result)
    expect(unclaimed).toBeInstanceOf(FileKindError)

    const disguised = await rejection(upload(ELF, { type: 'image/png', name: 'logo.png' }).result)
    expect(disguised).toBeInstanceOf(FileMimicryError)
    expect(disguised.message).toContain('mimicry:dangerous:')
  })

  test('refuses a body with no claim, or a binary no signature recognizes under a kind', async () => {
    const noClaim = await rejection(upload(PNG, {}).result)
    expect(noClaim.message).toBe('stored-file:type:mimicry:mime-mismatch')

    const garbage = Buffer.concat([Buffer.from([0x00, 0x01, 0x02, 0x03, 0xfe, 0xff]), randomBytes(2048)])
    const unrecognized = await rejection(upload(garbage, { type: 'image/png' }).result)
    expect(unrecognized.message).toBe('stored-file:type:mimicry:mime-mismatch')
  })

  test('accepts text types signatures cannot see, then reaches the store', async () => {
    const accepted: Array<[Uint8Array, Pick<StoredRecord, 'type' | 'name'>]> = [
      [MARKDOWN, { type: 'text/markdown', name: 'NOTES.md' }],
      [Buffer.from('name,size\nlogo.png,67\n'), { type: 'text/csv', name: 'files.csv' }],
      [Buffer.from('{"files":2}'), { type: 'application/json' }],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), { type: 'image/svg+xml', name: 'dot.svg' }],
      [PNG, { type: 'image/png', name: 'dot.png' }],
    ]
    for (const [bytes, claims] of accepted) {
      const error = await rejection(upload(bytes, claims).result)
      expect([claims, error]).toEqual([claims, expect.any(StorageApiError)])
    }
  }, 30_000)
})
