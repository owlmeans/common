import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import * as errors from '../src/errors.js'

/** What an HTTP boundary reads off a class: a static `httpStatus`, absent on a fault. */
const statusOf = (error: Error): unknown => (error.constructor as { httpStatus?: unknown }).httpStatus

const DECLARED: Record<string, number | undefined> = {
  BotError: undefined,
  BotConnectionNotFound: 404,
  BotCredentialsRejected: 422,
  BotSignatureRejected: 401,
  BotTransportMismatch: 409,
  BotUnsupportedAction: 422,
  BotErrorPlatform: undefined,
}

const classes = Object.entries(errors).filter(([, value]) =>
  typeof value === 'function' && (value === errors.BotError || value.prototype instanceof errors.BotError)
) as [string, new (message?: string) => ResilientError][]

describe('bot errors', () => {
  test('every class has decided its status', () => {
    expect(classes.map(([name]) => name).sort()).toEqual(Object.keys(DECLARED).sort())
    for (const [name, Class] of classes) {
      expect([name, statusOf(new Class('x'))]).toEqual([name, DECLARED[name]])
    }
  })

  test('messages carry the family prefix and the class marker', () => {
    expect(new errors.BotConnectionNotFound('conn_1').message).toBe('bot:connection-not-found:conn_1')
    expect(new errors.BotTransportMismatch('live').message).toBe('bot:transport-mismatch:live')
  })

  test('a platform refusal names its platform and keeps the detail as the plugin stated it', () => {
    const refusal = errors.BotErrorPlatform.of('acme', '400:Bad Request: message not found')

    expect(refusal.message).toBe('bot:platform:acme:400:Bad Request: message not found')
    expect([refusal.type, refusal.platform, refusal.detail])
      .toEqual(['BotErrorPlatform', 'acme', '400:Bad Request: message not found'])
  })

  test('a plugin subclass keeps the one wire type and is rebuilt as BotErrorPlatform where it is unknown', () => {
    class AcmeApiError extends errors.BotErrorPlatform {
      public code: number = 0

      constructor(message: string = '500:error') {
        super(`acme:${message}`)
        this.finalizeUnmarshal()
      }

      public override finalizeUnmarshal(): void {
        super.finalizeUnmarshal()
        this.code = Number(/^(\d+):/.exec(this.detail)?.[1] ?? 500)
      }
    }
    const thrown = new AcmeApiError('429:slow down')

    expect([thrown.type, thrown.platform, thrown.detail, thrown.code]).toEqual(['BotErrorPlatform', 'acme', '429:slow down', 429])
    const back = ResilientError.ensure(thrown.marshal())
    expect([back.constructor === errors.BotErrorPlatform, (back as errors.BotErrorPlatform).platform, back.message])
      .toEqual([true, 'acme', 'bot:platform:acme:429:slow down'])
  })

  test('a refusal rebuilt from its marshalled form keeps its class and its status', () => {
    for (const [name, Class] of classes) {
      const back = ResilientError.ensure(new Class('x').marshal())
      expect([name, back.constructor === Class, back instanceof errors.BotError, statusOf(back)])
        .toEqual([name, true, true, DECLARED[name]])
    }
  })
})
