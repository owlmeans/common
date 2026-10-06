import { describe, test, expect } from 'bun:test'
import { declareQueue, declareSchedule } from '../src/config.js'
import { queueConfigOf } from '../src/queue-config.js'
import { ScheduleMisdeclared, UnknownJobName, UnknownQueue } from '../src/errors.js'
import type { Config, ScheduleDeclaration } from '../src/types.js'

const cfg = (): Config => declareQueue(
  declareQueue({ ready: false, service: 'test', type: 'backend' } as unknown as Config,
    'maintenance', ['reconcile', 'sweep']),
  'work', ['story:code']
)

const nightly: ScheduleDeclaration = {
  id: 'nightly-reconcile', queue: 'maintenance', name: 'reconcile', pattern: '17 3 * * *', tz: 'UTC',
}

const misdeclared = (schedule: Partial<ScheduleDeclaration>): () => void =>
  () => queueConfigOf(cfg()).assertSchedule({ ...nightly, ...schedule } as ScheduleDeclaration)

describe('declaring schedules', () => {
  test('a declaration is recorded and read back by its queue', () => {
    const config = declareSchedule(cfg(), nightly)

    expect(queueConfigOf(config).schedulesOf('maintenance')).toEqual([nightly])
    expect(queueConfigOf(config).schedulesOf('work')).toEqual([])
    expect(queueConfigOf(config).schedulesOf()).toHaveLength(1)
  })

  test('re-declaring an id replaces rather than appends', () => {
    let config = declareSchedule(cfg(), nightly)
    config = declareSchedule(config, { ...nightly, pattern: '0 4 * * *' })

    expect(queueConfigOf(config).schedulesOf()).toHaveLength(1)
    expect(queueConfigOf(config).schedulesOf()[0].pattern).toBe('0 4 * * *')
  })

  /**
   * A scheduled run of a name the queue does not accept would fail on every tick. Refusing at
   * declaration turns that into one error at boot, and the refused schedule is not recorded.
   */
  test('a schedule for an undeclared queue or job name is refused and not recorded', () => {
    const config = cfg()

    expect(() => declareSchedule(config, { ...nightly, queue: 'missing' })).toThrow(UnknownQueue)
    expect(() => declareSchedule(config, { ...nightly, name: 'story:code' })).toThrow(UnknownJobName)
    expect(queueConfigOf(config).schedulesOf()).toHaveLength(0)
  })

  test('re-declaring the queue keeps its schedules', () => {
    const config = declareQueue(declareSchedule(cfg(), nightly), 'maintenance', ['reconcile'])

    expect(queueConfigOf(config).queueOf('maintenance').jobs).toEqual(['reconcile'])
    expect(queueConfigOf(config).schedulesOf()).toEqual([nightly])
  })
})

describe('asserting a schedule', () => {
  test('exactly one of every and pattern', () => {
    expect(misdeclared({ every: 1_000 })).toThrow(/every-or-pattern/)
    expect(misdeclared({ pattern: undefined, tz: undefined })).toThrow(/every-or-pattern/)
    expect(misdeclared({ pattern: undefined, tz: undefined, every: 0 })).toThrow(/:every$/)
    expect(misdeclared({ pattern: undefined, tz: undefined, every: 1.5 })).toThrow(ScheduleMisdeclared)
  })

  test('tz and immediately belong to a pattern only', () => {
    expect(misdeclared({ pattern: undefined, every: 1_000 })).toThrow(/:tz$/)
    expect(misdeclared({ pattern: undefined, tz: undefined, every: 1_000, immediately: true }))
      .toThrow(/:immediately$/)
    expect(misdeclared({ immediately: true, startDate: new Date() })).toThrow(/immediately-start-date/)
    expect(misdeclared({ immediately: true })).not.toThrow()
  })

  test('the broker owns a scheduled run\'s id and delay', () => {
    expect(misdeclared({ opts: { id: 'fixed' } as ScheduleDeclaration['opts'] })).toThrow(/opts-id/)
    expect(misdeclared({ opts: { delay: 10 } as ScheduleDeclaration['opts'] })).toThrow(/opts-delay/)
    expect(misdeclared({ opts: { attempts: 3 } })).not.toThrow()
  })

  test('an empty id is refused', () => {
    expect(misdeclared({ id: ' ' })).toThrow(ScheduleMisdeclared)
  })
})

describe('asserting every schedule', () => {
  test('two schedules under one id are refused', () => {
    const config = declareSchedule(cfg(), nightly)
    config.queue?.schedules?.push({ ...nightly, pattern: '0 5 * * *' })

    expect(() => queueConfigOf(config).assertSchedules()).toThrow(/duplicate/)
  })

  /** The configuration is plain data; a schedule written into it directly is checked too. */
  test('a schedule written past declareSchedule is still checked', () => {
    const config = declareSchedule(cfg(), nightly)
    config.queue?.schedules?.push({ id: 'orphan', queue: 'maintenance', name: 'gone', every: 1_000 })

    expect(() => queueConfigOf(config).assertSchedules()).toThrow(UnknownJobName)
  })
})
