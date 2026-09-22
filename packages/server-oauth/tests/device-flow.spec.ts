import { describe, expect, test } from 'bun:test'
import { handleDeviceAuthorization } from '../src/handlers/device.js'
import { approveConsent, denyConsent, loadConsent } from '../src/handlers/consent.js'
import { handleToken } from '../src/handlers/token.js'
import { makeOAuthProtocols } from '@owlmeans/oauth'
import { makeTestContext, seedProfile, session, TEST_CLIENT_ID } from './context.js'

const protocols = makeOAuthProtocols()
const load = loadConsent(protocols.load)
const approve = approveConsent(protocols.approve)
const deny = denyConsent(protocols.deny)

const invoke = async (handler: any, context: any, req: any): Promise<any> => {
  const res: any = { resolve: (value: unknown) => { res.value = value }, reject: (e: Error) => { res.error = e } }
  await handler.bind({ ref: { ctx: context } })(req, res)
  if (res.error != null) throw res.error

  return res.value
}

const consentReq = (ref: string, patch: Record<string, unknown> = {}): any => ({
  ...session(patch), params: { ref },
})

describe('device flow, end to end', () => {
  test('authorize → consent (by user code) → approve → poll succeeds exactly once', async () => {
    const context = makeTestContext()
    await seedProfile(context)

    const authorization = await handleDeviceAuthorization(context, { client_id: TEST_CLIENT_ID })
    expect(authorization.status).toBe(200)
    const { device_code: deviceCode, user_code: userCode, verification_uri_complete: complete } = authorization.body as any
    expect(complete).toContain(encodeURIComponent(userCode))

    // The consent screen resolves the typed/complete user code, lower-cased and un-dashed, just as
    // a person would type it or a QR code would carry it.
    const view = await invoke(load, context, consentReq(userCode.toLowerCase().replace('-', '')))
    expect(view.kind).toBe('device')
    expect(view.userCode).toBe(userCode)
    expect(view.client.name).toBe('Viable MCP')

    const approved = await invoke(approve, context, consentReq(userCode))
    expect(approved).toEqual({})

    const first = await handleToken(context, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: TEST_CLIENT_ID,
    })
    expect(first.status).toBe(200)
    expect((first.body as any).access_token).toMatch(/^tst_/)

    // A redelivered poll — the client retried after a dropped response — must not replay the token.
    const second = await handleToken(context, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: TEST_CLIENT_ID,
    })
    expect(second.status).toBe(400)
    expect((second.body as any).error).toBe('invalid_grant')
  })

  test('the client polls authorization_pending until approved', async () => {
    const context = makeTestContext()
    await seedProfile(context)
    const authorization = await handleDeviceAuthorization(context, { client_id: TEST_CLIENT_ID })
    const { device_code: deviceCode, user_code: userCode } = authorization.body as any

    const pending = await handleToken(context, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: TEST_CLIENT_ID,
    })
    expect(pending.status).toBe(400)
    expect((pending.body as any).error).toBe('authorization_pending')

    await invoke(approve, context, consentReq(userCode))
    const authorized = await handleToken(context, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: TEST_CLIENT_ID,
    })
    expect(authorized.status).toBe(200)
  })

  test('deny turns the next poll into access_denied, once', async () => {
    const context = makeTestContext()
    await seedProfile(context)
    const authorization = await handleDeviceAuthorization(context, { client_id: TEST_CLIENT_ID })
    const { device_code: deviceCode, user_code: userCode } = authorization.body as any

    await invoke(deny, context, consentReq(userCode))
    const denied = await handleToken(context, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: TEST_CLIENT_ID,
    })
    expect(denied.status).toBe(400)
    expect((denied.body as any).error).toBe('access_denied')

    const again = await handleToken(context, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: TEST_CLIENT_ID,
    })
    expect((again.body as any).error).toBe('invalid_grant')
  })

  test('an access token minted through this grant may never mint or revoke a token', async () => {
    const context = makeTestContext()
    await seedProfile(context)
    const authorization = await handleDeviceAuthorization(context, { client_id: TEST_CLIENT_ID })

    await expect(invoke(approve, context, consentReq(
      (authorization.body as any).user_code, { type: 'auth-token' }
    ))).rejects.toThrow()
  })

  test('a request for an unknown resource is refused before anything is created', async () => {
    const context = makeTestContext()

    const authorization = await handleDeviceAuthorization(context, { client_id: TEST_CLIENT_ID, resource: 'https://not-mine.example' })
    expect(authorization.status).toBe(400)
    expect((authorization.body as any).error).toBe('invalid_target')
  })

  test('an unknown client is refused', async () => {
    const context = makeTestContext()
    const authorization = await handleDeviceAuthorization(context, { client_id: 'nobody' })
    expect(authorization.status).toBe(400)
    expect((authorization.body as any).error).toBe('invalid_client')
  })

  test('a mismatched client_id at the token endpoint is refused, not silently accepted', async () => {
    const context = makeTestContext()
    await seedProfile(context)
    const authorization = await handleDeviceAuthorization(context, { client_id: TEST_CLIENT_ID })
    const { device_code: deviceCode } = authorization.body as any

    const outcome = await handleToken(context, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: 'somebody-else',
    })
    expect(outcome.status).toBe(400)
    expect((outcome.body as any).error).toBe('invalid_grant')
  })

})
