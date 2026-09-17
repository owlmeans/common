import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import { provideResponse } from '@owlmeans/entrypoint'
import { errorStatus, handleError } from '../src/utils/error.js'
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
  return { status: reply.statusCode, body: reply.body }
}

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
    expect(ResilientError.ensure(new Error(refused.body))).toBeInstanceOf(OutOfCredit)

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
