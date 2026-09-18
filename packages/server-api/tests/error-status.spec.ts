import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import { ResilientError, SEPARATOR } from '@owlmeans/error'
import { provideResponse } from '@owlmeans/entrypoint'
import { errorExposure, errorStatus, handleError, INCIDENT_ID_HEADER } from '../src/utils/error.js'
import { executeResponse } from '../src/utils/payload.js'
import { AccessError, AuthFailedError } from '../src/errors.js'

class OutOfCredit extends ResilientError {
  public static override typeName = 'ServerApiSpecOutOfCredit'
  public static httpStatus = 402

  constructor(message: string = 'error') {
    super(OutOfCredit.typeName, `out-of-credit:${message}`)
  }
}

/** Inherits 402 without redeclaring it. */
class OutOfCreditForStory extends OutOfCredit {
  public static override typeName = 'ServerApiSpecOutOfCreditForStory'

  constructor() {
    super('story')
    this.type = OutOfCreditForStory.typeName
  }
}

/** Redeclares its parent's status to a conflict. */
class Busy extends OutOfCredit {
  public static override typeName = 'ServerApiSpecBusy'
  public static override httpStatus = 409

  constructor() {
    super('busy')
    this.type = Busy.typeName
  }
}

/** An auth refusal that also declares a status: the auth mapping still wins. */
class DeclaringForbidden extends AuthForbidden {
  public static override typeName = 'ServerApiSpecDeclaringForbidden'
  public static httpStatus = 402

  constructor() {
    super('declaring')
    this.type = DeclaringForbidden.typeName
  }
}

class TemporarilyUnavailable extends ResilientError {
  public static override typeName = 'ServerApiSpecTemporarilyUnavailable'
  public static httpStatus = 503
  public static allowServerErrorStatus = true

  constructor() {
    super(TemporarilyUnavailable.typeName, 'temporarily-unavailable')
  }
}

class Throttled extends ResilientError {
  public static override typeName = 'ServerApiSpecThrottled'
  public static httpStatus = 429
  public readonly retryAfter = 17.2

  constructor() {
    super(Throttled.typeName, 'throttled')
  }
}

const declaring = (typeName: string, httpStatus: unknown) => {
  class Declaring extends ResilientError {
    public static override typeName = typeName
    public static httpStatus = httpStatus

    constructor(message: string = 'error') {
      super(typeName, message)
    }
  }
  return Declaring
}

/**
 * A duplicate module copy of the error family — what a process loading `@owlmeans/error` through
 * several `node_modules` paths holds: the same registered names, none of the imported classes.
 */
class ForeignResilientError extends Error {
  public static typeName = 'ResilientError'
  public type: string

  constructor(type: string, message: string) {
    super(message)
    this.type = type
  }
}

class ForeignAuthFailedError extends ForeignResilientError {
  public static override typeName = 'AuthFailedError'

  constructor() {
    super(ForeignAuthFailedError.typeName, 'api:auth:error')
  }
}

class ForeignAuthorizationError extends ForeignResilientError {
  public static override typeName = 'AuthorizationError'

  constructor(message: string = 'error') {
    super(ForeignAuthorizationError.typeName, `auth:authorization:${message}`)
  }
}

class ForeignAuthForbidden extends ForeignAuthorizationError {
  public static override typeName = 'ForbiddenAuthorizationError'

  constructor(message: string = 'error') {
    super(`forbidden:${message}`)
    this.type = ForeignAuthForbidden.typeName
  }
}

/** A subclass whose own name embeds nothing of its parent's, like `EntitlementRefusal`. */
class ForeignEntitlementRefusal extends ForeignAuthForbidden {
  public static override typeName = 'EntitlementRefusal'

  constructor() {
    super('entitlement')
    this.type = ForeignEntitlementRefusal.typeName
  }
}

/** A declared refusal no registry of this process knows. */
class ForeignOutOfCredit extends ForeignResilientError {
  public static override typeName = 'ServerApiSpecForeignOutOfCredit'
  public static httpStatus = 402

  constructor() {
    super(ForeignOutOfCredit.typeName, 'out-of-credit:foreign')
  }
}

const typed = (type: string) => Object.assign(new Error('typed'), { type })

ResilientError.registerErrorClass(OutOfCredit)
ResilientError.registerErrorClass(OutOfCreditForStory)
ResilientError.registerErrorClass(Busy)
ResilientError.registerErrorClass(DeclaringForbidden)

let server: FastifyInstance
let thrown: unknown

beforeAll(async () => {
  server = Fastify()
  server.get('/handle', async (_req, reply) => {
    handleError(thrown as Error, reply)
    return reply
  })
  server.get('/handle-development', async (_req, reply) => {
    handleError(thrown as Error, reply, 'development')
    return reply
  })
  server.get('/execute', async (_req, reply) => {
    const response = provideResponse(reply)
    response.reject(thrown as Error)
    executeResponse(response, reply)
    return reply
  })
  await server.ready()
})

afterAll(async () => {
  await server.close()
})

const answer = async (error: unknown, path: string = '/handle') => {
  thrown = error
  const reply = await server.inject({ method: 'GET', url: path })
  return {
    status: reply.statusCode,
    body: reply.body,
    incidentId: reply.headers[INCIDENT_ID_HEADER.toLowerCase()],
    retryAfter: reply.headers['retry-after'],
  }
}

describe('@owlmeans/server-api — production error exposure', () => {
  test('returns only an incident id in production and correlates it with the header', async () => {
    const response = await answer(new Error('private-marker'))
    expect(response.body).toBe(response.incidentId)
    expect(response.body).not.toContain('private-marker')
    expect(response.body).not.toContain(SEPARATOR)
    expect(response.body).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  test('includes stacks only under explicit development exposure and safely serializes SyntaxError', async () => {
    const development = await answer(new Error('development-marker'), '/handle-development')
    const [type, message, stack, incidentId] = development.body.split(SEPARATOR, 4)
    expect(type).toBe(ResilientError.typeName)
    expect(message).toBe('development-marker')
    expect(stack).toContain('development-marker')
    expect(incidentId).toBe(development.incidentId)

    const syntax = await answer(new SyntaxError('bad wiring'))
    expect(syntax.status).toBe(500)
    expect(syntax.body).toBe(syntax.incidentId)
    expect(syntax.body).not.toContain('bad wiring')

    expect(errorExposure()).toBe('production')
    expect(errorExposure({ http: { errors: { exposure: 'development' } } })).toBe('development')
  })
})

describe('@owlmeans/server-api — handleError status', () => {
  test('keeps the auth mappings: forbidden 403, unauthenticated 401', async () => {
    expect((await answer(new AuthForbidden('x'))).status).toBe(403)
    expect((await answer(new AccessError())).status).toBe(403)
    expect((await answer(new AuthorizationError('x'))).status).toBe(401)
    expect((await answer(new AuthFailedError())).status).toBe(401)
    expect((await answer(new DeclaringForbidden())).status).toBe(403)
  })

  test('honours a 4xx a class declares — inherited, redeclared, or after a marshal hop', async () => {
    const refused = await answer(new OutOfCredit('create'))
    expect(refused.status).toBe(402)
    expect(refused.body).toBe(refused.incidentId)

    expect((await answer(new OutOfCreditForStory())).status).toBe(402)
    expect((await answer(new Busy())).status).toBe(409)
    expect((await answer(ResilientError.marshal(new Busy()))).status).toBe(409)
    expect((await answer(new ForeignOutOfCredit())).status).toBe(402)
  })

  test('answers 500 for no declaration, or one outside the client-error range', async () => {
    expect((await answer(new ResilientError('Plain', 'plain'))).status).toBe(500)
    expect((await answer(new Error('boom'))).status).toBe(500)
    for (const status of [500, 503, 200, 302, 399, 600, 402.5, '402', null]) {
      const Declaring = declaring(`ServerApiSpecDeclaring${String(status)}`, status)
      expect((await answer(new Declaring())).status).toBe(500)
    }
    for (const type of ['AuthFailedErrorX', 'NotAuthorizationError', 'Forbidden', 'ResilientError']) {
      expect((await answer(typed(type))).status).toBe(500)
      expect((await answer(new ForeignResilientError(type, 'near-miss'))).status).toBe(500)
    }
  })

  test('honours an explicitly exposed 5xx without opening arbitrary server statuses', async () => {
    expect((await answer(new TemporarilyUnavailable())).status).toBe(503)
    const Unexposed = declaring('ServerApiSpecUnexposed503', 503)
    expect((await answer(new Unexposed())).status).toBe(500)
  })

  test('emits Retry-After for a throttled response', async () => {
    const response = await answer(new Throttled())
    expect(response.status).toBe(429)
    expect(response.retryAfter).toBe('18')
  })

  test('executeResponse answers a rejected response with the same status', async () => {
    expect((await answer(new OutOfCredit('create'), '/execute')).status).toBe(402)
    expect((await answer(new AuthForbidden('x'), '/execute')).status).toBe(403)
    expect((await answer(new ResilientError('Plain', 'plain'), '/execute')).status).toBe(500)
  })
})

describe('@owlmeans/server-api — auth status across a rebuild and duplicate module copies', () => {
  test('an AuthFailedError answers 401 as thrown and after a marshal round trip', async () => {
    expect((await answer(new AuthFailedError())).status).toBe(401)
    expect((await answer(ResilientError.marshal(new AuthFailedError()))).status).toBe(401)
    expect(errorStatus(ResilientError.ensure(ResilientError.marshal(new AuthFailedError())))).toBe(401)
    expect((await answer(new AuthFailedError(), '/execute')).status).toBe(401)
  })

  test('a class from another module copy answers by its registered type name', async () => {
    // The rebuild alone loses it — the regression this resolution exists for.
    expect(errorStatus(ResilientError.ensure(new ForeignAuthFailedError()))).toBe(500)
    expect((await answer(new ForeignAuthFailedError())).status).toBe(401)
    expect((await answer(new ForeignAuthorizationError())).status).toBe(401)
    expect((await answer(new ForeignAuthForbidden())).status).toBe(403)
    expect((await answer(new ForeignAuthForbidden(), '/execute')).status).toBe(403)
  })

  test('the family is read off the instance type or the constructor chain, 403 before 401', async () => {
    expect((await answer(typed('AuthFailedError'))).status).toBe(401)
    expect((await answer(typed('ForbiddenAuthorizationError'))).status).toBe(403)
    expect((await answer(typed('AccessAuthFailedError'))).status).toBe(403)
    // Its own type names nothing of the family; only the chain does.
    expect((await answer(new ForeignEntitlementRefusal())).status).toBe(403)
  })
})
