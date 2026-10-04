import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { addLogPlugin, configureLog, memoryPlugin, resetLog } from '@owlmeans/log'
import { fastifyLogger } from '../src/utils/log.js'

const memory = memoryPlugin('adapter')

beforeEach(() => {
  resetLog()
  addLogPlugin(memory)
  configureLog({ level: 'debug', console: 'native' })
})
afterEach(() => { memory.clear(); resetLog() })

describe('@owlmeans/server-api — the Fastify logger adapter', () => {
  test('drops the request pair, lowers the listening and not-found lines, keeps the rest', () => {
    const log = fastifyLogger() as unknown as Record<string, (...args: unknown[]) => void>
    log.info({ req: {} }, 'incoming request')
    log.info({ res: {} }, 'request completed')
    log.info('Server listening at http://127.0.0.1:80')
    log.info({ url: '/x' }, 'Route GET:/x not found')
    log.info('something else')
    log.warn({ a: 1 }, 'warned')
    log.error({ err: new Error('boom') }, 'failed')

    expect(memory.records.map(r => [r.level, r.message])).toEqual([
      ['debug', 'Server listening at http://127.0.0.1:80'],
      ['debug', 'Route GET:/x not found'],
      ['info', 'something else'],
      ['warn', 'warned'],
      ['error', 'failed'],
    ])
    expect(memory.records[4].error?.message).toBe('boom')
  })

  test('child loggers bind their fields and the level is the process level', () => {
    const base = fastifyLogger()
    const child = (base as unknown as { child: (b: object) => Record<string, (...a: unknown[]) => void> }).child({ reqId: 'r1' })
    child.warn('hello')
    expect(memory.records[0].data).toEqual({ reqId: 'r1' })
    expect(base.level).toBe('debug')
    configureLog({ level: 'warn' })
    expect(base.level).toBe('warn')
  })

  test('at info level, debug lines are not written', () => {
    configureLog({ level: 'info' })
    const log = fastifyLogger() as unknown as Record<string, (...args: unknown[]) => void>
    log.debug('quiet')
    log.info('shown')
    expect(memory.records.map(r => r.message)).toEqual(['shown'])
  })
})
