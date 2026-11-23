import { describe, expect, test } from 'bun:test'
import { WorkcardKind, type Workcard } from '@owlmeans/planning'
import {
  VIABLE_FEATURE_TYPE, VIABLE_IMPROVEMENT_TYPE, VIABLE_SPEC_CARD_TYPE, VIABLE_TASK_TYPE, VIABLE_USER_STORY_TYPE,
  ViableWorkcardStatus, WorkRerunScope, workRerunHelper,
} from '../src/planning/index.js'

const card = (id: string, type: string, status: ViableWorkcardStatus): Workcard =>
  ({ id, kind: WorkcardKind.Card, type, status, title: id, parent: 'p', parents: ['p', 'c'] }) as Workcard

const spec = card('c', VIABLE_SPEC_CARD_TYPE, ViableWorkcardStatus.Failed)
const feature = card('c', VIABLE_FEATURE_TYPE, ViableWorkcardStatus.Failed)

describe('viable-common — a container\'s re-run', () => {
  const members = [
    card('done', VIABLE_USER_STORY_TYPE, ViableWorkcardStatus.Completed),
    card('broken', VIABLE_USER_STORY_TYPE, ViableWorkcardStatus.Failed),
    card('fresh', VIABLE_USER_STORY_TYPE, ViableWorkcardStatus.Planned),
    card('imp', VIABLE_IMPROVEMENT_TYPE, ViableWorkcardStatus.Failed),
    card('task', VIABLE_TASK_TYPE, ViableWorkcardStatus.Planned),
  ]

  test('failed takes only the failed members; unfinished every one not completed — in the order given', () => {
    expect(workRerunHelper.membersOf(spec, members, WorkRerunScope.Failed).map(one => one.id)).toEqual(['broken', 'imp'])
    expect(workRerunHelper.membersOf(spec, members, WorkRerunScope.Unfinished).map(one => one.id)).toEqual(['broken', 'fresh', 'imp', 'task'])
  })

  test('a feature re-runs only its user stories — the units its planned run builds', () => {
    expect(workRerunHelper.membersOf(feature, members, WorkRerunScope.Failed).map(one => one.id)).toEqual(['broken'])
    expect(workRerunHelper.membersOf(feature, members, WorkRerunScope.Unfinished).map(one => one.id)).toEqual(['broken', 'fresh'])
  })

  test('a member in progress is never taken, and blocks every re-run', () => {
    const running = [...members, card('alone', VIABLE_USER_STORY_TYPE, ViableWorkcardStatus.InProgress)]
    expect(workRerunHelper.membersOf(spec, running, WorkRerunScope.Unfinished).map(one => one.id)).not.toContain('alone')
    expect(workRerunHelper.blockOf(spec, running)).toBe('member')
    expect(workRerunHelper.scopesOf(spec, running)).toEqual([])
  })

  test('a running container offers nothing; otherwise each scope that has members, failed first', () => {
    expect(workRerunHelper.blockOf({ status: ViableWorkcardStatus.InProgress }, members)).toBe('running')
    expect(workRerunHelper.scopesOf({ ...spec, status: ViableWorkcardStatus.InProgress }, members)).toEqual([])
    expect(workRerunHelper.blockOf(spec, members)).toBeNull()
    expect(workRerunHelper.scopesOf(spec, members)).toEqual([WorkRerunScope.Failed, WorkRerunScope.Unfinished])
    const planned = members.filter(one => one.status !== ViableWorkcardStatus.Failed)
    expect(workRerunHelper.scopesOf(spec, planned)).toEqual([WorkRerunScope.Unfinished])
    const done = members.filter(one => one.status === ViableWorkcardStatus.Completed)
    expect(workRerunHelper.scopesOf(spec, done)).toEqual([])
    expect(workRerunHelper.scopesOf(spec, [])).toEqual([])
  })

  test('the scope words are the wire values', () => {
    expect(Object.values(WorkRerunScope)).toEqual(['failed', 'unfinished'])
    expect(workRerunHelper.isScope('failed')).toBe(true)
    expect(workRerunHelper.isScope('unfinished')).toBe(true)
    expect(workRerunHelper.isScope('all')).toBe(false)
    expect(workRerunHelper.isScope(undefined)).toBe(false)
  })
})
