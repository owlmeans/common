import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Ajv, type ErrorObject, type JSONSchemaType } from 'ajv'
import { configureLog, logConfig } from '@owlmeans/log'
import { LlmNoticeKind, LlmRetryExceededError, makeLlmModel } from '../src/index.js'
import { pruneUtils } from '../src/utils/prune.js'
import { noticeSpectator, scriptedChain } from './scripted.js'

/**
 * Pruning (`LlmModelOptions.prune`): a call about to end on a schema refusal drops what the schema
 * allows to be missing — a nullable node set to null, an optional key deleted — and accepts the rest
 * only if the caller's filter and the schema both still accept it.
 */

const ajv = new Ajv({ strict: false, allErrors: true })

const errorsOf = (schema: object, value: unknown): ErrorObject[] => {
  const validate = ajv.compile(schema)
  expect(validate(value)).toBe(false)

  return [...validate.errors!]
}

const StorySchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    interaction: {
      type: 'object', nullable: true,
      properties: { entity: { type: 'string' }, kind: { type: 'string' } },
      required: ['entity'],
    },
  },
  required: ['title', 'interaction'],
}

const PlanSchema = {
  type: 'object',
  properties: {
    stories: { type: 'array', items: StorySchema },
    meta: { type: 'object', properties: { owner: { type: 'string' } }, required: ['owner'] },
    hostKind: { anyOf: [{ const: 'web' }, { const: 'api' }] },
    labels: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  },
  required: ['stories'],
}

describe('utils/prune — what a schema allows to be missing', () => {
  test('a required key that may be null is nulled, inside an array item that stays where it was', () => {
    const value = { stories: [{ title: 'a', interaction: { entity: 'Task' } }, { title: 'b', interaction: { kind: 'list' } }] }
    const pruned = pruneUtils.prune(PlanSchema, value, errorsOf(PlanSchema, value))

    expect(pruned).toEqual({
      value: { stories: [{ title: 'a', interaction: { entity: 'Task' } }, { title: 'b', interaction: null }] },
      paths: ['/stories/1/interaction'],
    })
    expect(ajv.validate(PlanSchema, pruned!.value)).toBe(true)
    // The refused answer itself is never edited.
    expect(value.stories[1]!.interaction).toEqual({ kind: 'list' })
  })

  test('an invalid optional object is deleted, and so is an optional anyOf node as a whole', () => {
    const value = { stories: [], meta: {}, hostKind: 'worker' }
    const pruned = pruneUtils.prune(PlanSchema, value, errorsOf(PlanSchema, value))

    expect(pruned!.value).toEqual({ stories: [] })
    expect(pruned!.paths.sort()).toEqual(['/hostKind', '/meta'])
  })

  test('an array item is never dropped: an error with nothing prunable below its item prunes nothing', () => {
    const value = { stories: [], labels: [{ name: 'ok' }, {}] }

    expect(pruneUtils.prune(PlanSchema, value, errorsOf(PlanSchema, value))).toBeNull()
  })

  test('a required key that may not be null has no prunable node: nothing is pruned', () => {
    const value = { stories: [{ interaction: null }] }

    expect(pruneUtils.prune(PlanSchema, value, errorsOf(PlanSchema, value))).toBeNull()
    expect(pruneUtils.prune(PlanSchema, { meta: {} }, errorsOf(PlanSchema, { meta: {} }))).toBeNull()
  })
})

interface Plan { name: string, meta?: { owner: string }, gate?: { key: string } }

const PlanAnswerSchema = {
  type: 'object', title: 'Plan',
  properties: {
    name: { type: 'string' },
    meta: { type: 'object', properties: { owner: { type: 'string' } }, required: ['owner'] },
    gate: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
  },
  required: ['name'],
} as unknown as JSONSchemaType<Plan>

describe('@owlmeans/llm — prune: true on invoke', () => {
  let level: ReturnType<typeof logConfig>['level']
  beforeAll(() => { level = logConfig().level; configureLog({ level: 'silent' }) })
  afterAll(() => { configureLog({ level }) })

  test('a call ending on a repeated refusal returns the pruned answer and reports what was dropped', async () => {
    const { model, sent } = scriptedChain(['{"name":"a","meta":{}}'])
    const spectator = noticeSpectator()
    const result = await makeLlmModel({ model, purpose: { type: 'prune-spec' }, retries: 8, prune: true }, spectator)
      .invoke('Plan it', PlanAnswerSchema, { action: 'prune' })

    expect(result).toEqual({ name: 'a' })
    expect(sent).toHaveLength(2)
    expect(spectator.notices.find(event => event.kind === LlmNoticeKind.Pruned))
      .toMatchObject({ action: 'prune', attempt: 1, paths: ['/meta'] })
  })

  test('the filter runs again over the pruned answer, and a refusal there ends the call unpruned', async () => {
    const { model } = scriptedChain(['{"name":"a","gate":{}}'])
    const spectator = noticeSpectator()
    const seen: Plan[] = []
    const failure = await makeLlmModel({ model, purpose: { type: 'prune-spec' }, retries: 8, prune: true }, spectator)
      .invoke('Plan it', PlanAnswerSchema, {
        action: 'prune-filter',
        // A decided gate must survive: an answer that lost it is refused.
        filter: plan => { seen.push(plan); return plan.gate != null ? plan : null },
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(LlmRetryExceededError)
    expect(seen).toHaveLength(3)
    expect(seen[2]).toEqual({ name: 'a' })
    expect(spectator.notices.some(event => event.kind === LlmNoticeKind.Pruned)).toBe(false)
  })

  test('the filter\'s own amendment of the pruned answer is what comes back', async () => {
    const { model } = scriptedChain(['{"name":"a","meta":{}}'])
    const result = await makeLlmModel({ model, purpose: { type: 'prune-spec' }, retries: 8, prune: true }, noticeSpectator())
      .invoke('Plan it', PlanAnswerSchema, { action: 'prune-amend', filter: plan => ({ ...plan, name: plan.name.toUpperCase() }) })

    expect(result).toEqual({ name: 'A' })
  })

  test('without prune the same call ends with the repeated refusal; the last attempt prunes too', async () => {
    const off = scriptedChain(['{"name":"a","meta":{}}'])
    await expect(makeLlmModel({ model: off.model, purpose: { type: 'prune-spec' }, retries: 8 }, noticeSpectator())
      .invoke('Plan it', PlanAnswerSchema, { action: 'unpruned' })).rejects.toBeInstanceOf(LlmRetryExceededError)

    // Two different refusals: no repeat, the retries run out, and the last one is pruned.
    const last = scriptedChain(['{"name":"a","meta":{}}', '{"name":"a","gate":{"key":1}}'])
    const result = await makeLlmModel({ model: last.model, purpose: { type: 'prune-spec' }, retries: 2, prune: true }, noticeSpectator())
      .invoke('Plan it', PlanAnswerSchema, { action: 'prune-last' })
    expect(result).toEqual({ name: 'a' })
    expect(last.sent).toHaveLength(2)
  })
})
