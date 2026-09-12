import { describe, expect, test } from 'bun:test'
import { contract, protocol, schema } from '@owlmeans/entrypoint'
import { job, route } from '@owlmeans/route'
import type { JSONSchemaType } from 'ajv'
import { enqueueProtocol, waitForProtocol, type JobRecord } from '../src/index.js'

interface Input { value: number }
interface Output { doubled: number }
const InputSchema = schema<Input>({
  type: 'object', properties: { value: { type: 'number' } }, required: ['value'], additionalProperties: false,
} as JSONSchemaType<Input>)
const OutputSchema = schema<Output>({
  type: 'object', properties: { doubled: { type: 'number' } }, required: ['doubled'], additionalProperties: false,
} as JSONSchemaType<Output>)
const declaration = protocol(
  route('test:double', '/double', job({ queue: 'test' })),
  contract(InputSchema, OutputSchema),
)

const context = (reply: unknown = { value: { doubled: 6 } }) => {
  const created: Partial<JobRecord>[] = []
  return {
    cfg: { queue: { queues: [{ name: 'test', jobs: [declaration.alias] }] } },
    jobs: () => ({
      create: async (record: Partial<JobRecord>) => {
        created.push(record)
        return { ...record, id: 'job-1' } as JobRecord
      },
      wait: async () => reply,
    }),
    created,
  }
}

describe('protocol-aware queue calls', () => {
  test('derives the broker address and keeps per-call options', async () => {
    const ctx = context()
    const queued = await enqueueProtocol(ctx as never, declaration, { body: { value: 3 } }, {
      delay: 250, attempts: 3, id: 'projection-1',
    })
    expect(queued.queue).toBe('test')
    expect(ctx.created[0]?.name).toBe(declaration.alias)
    expect(ctx.created[0]?.opts).toEqual({ delay: 250, attempts: 3, id: 'projection-1' })
    expect(await waitForProtocol(ctx as never, declaration, queued as never)).toEqual({ doubled: 6 })
  })

  test('rejects raw aliases and non-queue declarations at runtime', async () => {
    await expect(enqueueProtocol(context() as never, declaration.alias as never, {} as never)).rejects.toThrow()
    const http = protocol(route('test:http', '/http'), contract())
    await expect(enqueueProtocol(context() as never, http, {})).rejects.toThrow()
  })

  test('rejects a job from another queue or protocol', async () => {
    await expect(waitForProtocol(context() as never, declaration, {
      id: 'x', queue: 'other', name: declaration.alias, data: {},
    } as never)).rejects.toThrow()
  })
})
