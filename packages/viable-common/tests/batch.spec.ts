import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ResilientError } from '@owlmeans/error'
import * as batch from '../src/batch/index.js'
import * as barrel from '../src/index.js'
import {
  AGENT_NOT_RUNNING_MARKER, AgentStopScope, WORKCARD_BATCH_ACTIVE_MARKER, WORKCARD_BATCH_EMPTY_MARKER, WORKCARD_BATCH_LIVE,
  WORKCARD_BATCH_REASON_MAX, WorkcardBatchKind, WorkcardBatchOrderSource, WorkcardBatchOutcome, WorkcardBatchStatus,
} from '../src/batch/consts.js'
import { AgentNotRunning, WorkcardBatchActive, WorkcardBatchEmpty } from '../src/batch/errors.js'
import { WorkcardBatchViewSchema } from '../src/batch/schemas.js'
import { ProjectError } from '../src/planning/errors.js'
import type { WorkcardBatchView } from '../src/batch/types.js'

const view = (patch: Partial<WorkcardBatchView> = {}): WorkcardBatchView => ({
  id: 'b1',
  projectId: 'p1',
  kind: WorkcardBatchKind.Workcards,
  status: WorkcardBatchStatus.Running,
  stories: ['c2', 'c1'],
  codes: { c1: 'US-AAAAA', c2: 'US-BBBBB' },
  ordering: { source: WorkcardBatchOrderSource.Model, reasons: { c2: 'creates the record US-AAAAA lists' } },
  current: 'c2',
  outcomes: {},
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:05:00.000Z',
  ...patch,
})

describe('viable-common — the story batch and the agent controls', () => {
  test('the vocabulary is the wire one', () => {
    expect(Object.values(WorkcardBatchKind)).toEqual(['stories', 'conversion'])
    expect(Object.values(WorkcardBatchStatus)).toEqual(['ordering', 'running', 'completed', 'cancelled', 'halted'])
    expect(Object.values(WorkcardBatchOutcome)).toEqual(['completed', 'failed', 'stopped', 'skipped', 'refused'])
    expect(Object.values(WorkcardBatchOrderSource)).toEqual(['model', 'graph', 'board'])
    expect(Object.values(AgentStopScope)).toEqual(['run', 'story', 'batch'])
    expect(WORKCARD_BATCH_LIVE).toEqual([WorkcardBatchStatus.Ordering, WorkcardBatchStatus.Running])
    expect(Object.isFrozen(WORKCARD_BATCH_LIVE)).toBe(true)
  })

  test('every schema compiles and is reachable from the package barrel', () => {
    const ajv = new Ajv({ strict: false })
    const schemas = Object.entries(batch).filter(([name]) => name.endsWith('Schema'))

    expect(schemas.map(([name]) => name).sort())
      .toEqual(['AgentSteerArgsSchema', 'AgentStopArgsSchema', 'WorkcardBatchStartArgsSchema', 'WorkcardBatchViewSchema'])
    for (const [name, schema] of schemas) {
      expect(() => ajv.compile(schema as never), name).not.toThrow()
      expect((barrel as Record<string, unknown>)[name]).toBe(schema)
    }
  })

  test('the view is closed: an ordering, outcomes and a halt reason pass, a stray key or value does not', () => {
    const validate = new Ajv({ strict: false }).compile(WorkcardBatchViewSchema)

    expect(validate(view())).toBe(true)
    expect(validate(view({ ordering: undefined, current: undefined }))).toBe(true)
    expect(validate(view({
      status: WorkcardBatchStatus.Halted, reason: 'viable-connect:out-of-credits:story:1:0:x',
      outcomes: { c2: WorkcardBatchOutcome.Completed, c1: WorkcardBatchOutcome.Stopped }, finishedAt: '2026-10-24T11:00:00.000Z',
    }))).toBe(true)
    expect(validate({ ...view(), batchId: 'b1' })).toBe(false)
    expect(validate(view({ outcomes: { c1: 'abandoned' as WorkcardBatchOutcome } }))).toBe(false)
    expect(validate(view({ status: 'paused' as WorkcardBatchStatus }))).toBe(false)
    expect(validate(view({ ordering: { source: WorkcardBatchOrderSource.Graph, reasons: { c1: 'x'.repeat(WORKCARD_BATCH_REASON_MAX + 1) } } })))
      .toBe(false)
  })

  test('each refusal carries its marker and keeps its class and status through a marshal', () => {
    const cases: [ResilientError, string, number][] = [
      [new AgentNotRunning('stop'), `viable-project:${AGENT_NOT_RUNNING_MARKER}:stop`, 409],
      [new WorkcardBatchActive('b1'), `viable-project:${WORKCARD_BATCH_ACTIVE_MARKER}:b1`, 409],
      [new WorkcardBatchEmpty(), `viable-project:${WORKCARD_BATCH_EMPTY_MARKER}`, 400],
      [new WorkcardBatchEmpty('none-planned'), `viable-project:${WORKCARD_BATCH_EMPTY_MARKER}:none-planned`, 400],
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
