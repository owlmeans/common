import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ResilientError } from '@owlmeans/error'
import * as batch from '../src/batch/index.js'
import * as barrel from '../src/index.js'
import {
  AGENT_NOT_RUNNING_MARKER, AgentStopScope, STORY_BATCH_ACTIVE_MARKER, STORY_BATCH_EMPTY_MARKER, STORY_BATCH_LIVE,
  STORY_BATCH_REASON_MAX, StoryBatchKind, StoryBatchOrderSource, StoryBatchOutcome, StoryBatchStatus,
} from '../src/batch/consts.js'
import { AgentNotRunning, StoryBatchActive, StoryBatchEmpty } from '../src/batch/errors.js'
import { StoryBatchViewSchema } from '../src/batch/schemas.js'
import { ProjectError } from '../src/planning/errors.js'
import type { StoryBatchView } from '../src/batch/types.js'

const view = (patch: Partial<StoryBatchView> = {}): StoryBatchView => ({
  id: 'b1',
  projectId: 'p1',
  kind: StoryBatchKind.Stories,
  status: StoryBatchStatus.Running,
  stories: ['c2', 'c1'],
  codes: { c1: 'US-AAAAA', c2: 'US-BBBBB' },
  ordering: { source: StoryBatchOrderSource.Model, reasons: { c2: 'creates the record US-AAAAA lists' } },
  current: 'c2',
  outcomes: {},
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:05:00.000Z',
  ...patch,
})

describe('viable-common — the story batch and the agent controls', () => {
  test('the vocabulary is the wire one', () => {
    expect(Object.values(StoryBatchKind)).toEqual(['stories', 'conversion'])
    expect(Object.values(StoryBatchStatus)).toEqual(['ordering', 'running', 'completed', 'cancelled', 'halted'])
    expect(Object.values(StoryBatchOutcome)).toEqual(['completed', 'failed', 'stopped', 'skipped', 'refused'])
    expect(Object.values(StoryBatchOrderSource)).toEqual(['model', 'graph', 'board'])
    expect(Object.values(AgentStopScope)).toEqual(['run', 'story', 'batch'])
    expect(STORY_BATCH_LIVE).toEqual([StoryBatchStatus.Ordering, StoryBatchStatus.Running])
    expect(Object.isFrozen(STORY_BATCH_LIVE)).toBe(true)
  })

  test('every schema compiles and is reachable from the package barrel', () => {
    const ajv = new Ajv({ strict: false })
    const schemas = Object.entries(batch).filter(([name]) => name.endsWith('Schema'))

    expect(schemas.map(([name]) => name).sort())
      .toEqual(['AgentSteerArgsSchema', 'AgentStopArgsSchema', 'StoryBatchStartArgsSchema', 'StoryBatchViewSchema'])
    for (const [name, schema] of schemas) {
      expect(() => ajv.compile(schema as never), name).not.toThrow()
      expect((barrel as Record<string, unknown>)[name]).toBe(schema)
    }
  })

  test('the view is closed: an ordering, outcomes and a halt reason pass, a stray key or value does not', () => {
    const validate = new Ajv({ strict: false }).compile(StoryBatchViewSchema)

    expect(validate(view())).toBe(true)
    expect(validate(view({ ordering: undefined, current: undefined }))).toBe(true)
    expect(validate(view({
      status: StoryBatchStatus.Halted, reason: 'viable-connect:out-of-credits:story:1:0:x',
      outcomes: { c2: StoryBatchOutcome.Completed, c1: StoryBatchOutcome.Stopped }, finishedAt: '2026-10-24T11:00:00.000Z',
    }))).toBe(true)
    expect(validate({ ...view(), batchId: 'b1' })).toBe(false)
    expect(validate(view({ outcomes: { c1: 'abandoned' as StoryBatchOutcome } }))).toBe(false)
    expect(validate(view({ status: 'paused' as StoryBatchStatus }))).toBe(false)
    expect(validate(view({ ordering: { source: StoryBatchOrderSource.Graph, reasons: { c1: 'x'.repeat(STORY_BATCH_REASON_MAX + 1) } } })))
      .toBe(false)
  })

  test('each refusal carries its marker and keeps its class and status through a marshal', () => {
    const cases: [ResilientError, string, number][] = [
      [new AgentNotRunning('stop'), `viable-project:${AGENT_NOT_RUNNING_MARKER}:stop`, 409],
      [new StoryBatchActive('b1'), `viable-project:${STORY_BATCH_ACTIVE_MARKER}:b1`, 409],
      [new StoryBatchEmpty(), `viable-project:${STORY_BATCH_EMPTY_MARKER}`, 400],
      [new StoryBatchEmpty('none-planned'), `viable-project:${STORY_BATCH_EMPTY_MARKER}:none-planned`, 400],
    ]
    for (const [error, message, status] of cases) {
      expect(error.message).toBe(message)
      expect(error).toBeInstanceOf(ProjectError)
      const back = ResilientError.ensure(error.marshal())
      expect(back.constructor).toBe(error.constructor)
      expect(back.message).toBe(message)
      expect((back.constructor as { httpStatus?: number }).httpStatus).toBe(status)
    }
  })
})
