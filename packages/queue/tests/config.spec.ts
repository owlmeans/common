import { describe, test, expect } from 'bun:test'
import { declareQueue, listenQueues } from '../src/config.js'
import { queueConfigOf } from '../src/queue-config.js'
import { UnknownQueue } from '../src/errors.js'
import type { Config } from '../src/types.js'

const cfg = (): Config => ({ ready: false, service: 'test', type: 'backend' } as unknown as Config)

describe('declaring queues', () => {
  test('a declaration records the queue and the jobs it accepts', () => {
    const config = declareQueue(cfg(), 'work', ['story:code', 'story:gate'])

    expect(queueConfigOf(config).queueOf('work').jobs).toEqual(['story:code', 'story:gate'])
  })

  /**
   * Declaring runs from a helper that an application may call once per app it composes, so the
   * second call must not leave two entries under one name — a duplicate would make `queueOf`
   * answer with whichever happened to be first.
   */
  test('re-declaring the same name replaces rather than appends', () => {
    let config = declareQueue(cfg(), 'work', ['story:code'])
    config = declareQueue(config, 'work', ['story:code', 'story:gate'])

    expect(config.queue?.queues).toHaveLength(1)
    expect(queueConfigOf(config).queueOf('work').jobs).toHaveLength(2)
  })

  test('asking for a queue nobody declared is an error, not undefined', () => {
    expect(() => queueConfigOf(cfg()).queueOf('missing')).toThrow(UnknownQueue)
  })

  test('a job name resolves back to the queue that accepts it', () => {
    const config = declareQueue(declareQueue(cfg(), 'work', ['story:code']), 'ops', ['files:get'])

    expect(queueConfigOf(config).queueOfJob('files:get')?.name).toBe('ops')
    expect(queueConfigOf(config).queueOfJob('nothing:declared')).toBeUndefined()
  })
})

describe('listening', () => {
  /**
   * Declaring a queue must NOT make this process consume it — that separation is what lets one
   * binary deploy as a producer in one place and a worker in another.
   */
  test('declaring a queue does not make the process listen to it', () => {
    const config = declareQueue(cfg(), 'work', ['story:code'])

    expect(queueConfigOf(config).isListening('work')).toBe(false)
    expect(config.queue?.listen ?? []).toHaveLength(0)
  })

  test('listening is additive and free of duplicates', () => {
    let config = listenQueues(cfg(), 'work')
    config = listenQueues(config, 'work', 'ops')

    expect(config.queue?.listen).toEqual(['work', 'ops'])
    expect(queueConfigOf(config).isListening('ops')).toBe(true)
  })

  test('listening and declaring do not overwrite each other', () => {
    const config = declareQueue(listenQueues(cfg(), 'work'), 'work', ['story:code'])

    expect(queueConfigOf(config).isListening('work')).toBe(true)
    expect(queueConfigOf(config).queueOf('work').jobs).toEqual(['story:code'])
  })
})
