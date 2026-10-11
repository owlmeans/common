import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { addLogPlugin, configureLog, memoryPlugin, resetLog } from '@owlmeans/log'
import { fastifyLogUtils } from '../src/utils/log.js'

const fastifyLogger = fastifyLogUtils.logger

const memory = memoryPlugin('adapter')

beforeEach(() => {
  resetLog()
  addLogPlugin(memory)
  configureLog({ level: 'debug', console: 'native' })
})
afterEach(() => { memory.clear(); resetLog() })

describe('@owlmeans/server-api — the Fastify logger adapter', () => {
  test('lowers the listening line, keeps the rest', () => {
    const log = fastifyLogger() as unknown as Record<string, (...args: unknown[]) => void>
    log.info('Server listening at http://127.0.0.1:80')
    log.info('something else')
    log.warn({ a: 1 }, 'warned')
    log.error({ err: new Error('boom') }, 'failed')

    expect(memory.records.map(r => [r.level, r.message])).toEqual([
      ['debug', 'Server listening at http://127.0.0.1:80'],
      ['info', 'something else'],
      ['warn', 'warned'],
      ['error', 'failed'],
    ])
    expect(memory.records[3].error?.message).toBe('boom')
  })

  test('the controller writes no per-request pair and a missing route without its query', () => {
    const controller = fastifyLogUtils.controller()
    const request = { method: 'GET', url: '/x?token=abc' } as never
    controller.incomingRequest(request, {} as never)
    controller.requestCompleted(null, request, { statusCode: 200 } as never)
    controller.routeNotFound(request, {} as never)

    expect(memory.records.map(r => [r.level, r.message, r.data])).toEqual([
      ['debug', 'Route not found', { method: 'GET', path: '/x' }],
    ])
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
