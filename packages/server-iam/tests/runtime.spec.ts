import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Server } from 'bun'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import { IAM_API_METADATA, ORGANIZATION_OWNER_REFUSAL, ORGANIZATION_REFUSAL } from '@owlmeans/oidc'
import { IamClientError, IamError, IamGrantMode, IamGrantOrigin } from '@owlmeans/iam'
import { makeIamRuntimeClient } from '@owlmeans/server-iam'
import type { IamRuntimeClient } from '@owlmeans/server-iam'
import { ACCESS_TOKEN, requestOf, seedSession, start } from './context.js'

/**
 * The runtime client against a stand-in for the provider's runtime API, served on an OS-assigned
 * port. The stand-in records what reached it and answers whatever `answer` says for the path.
 */
interface Seen {
  method: string
  path: string
  query: Record<string, string>
  authorization: string | null
  body?: unknown
}

const seen: Seen[] = []
let answer: (seen: Seen) => Response = () => Response.json({ items: [] })
let server: Server<undefined>
let base: string

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: async request => {
      const url = new URL(request.url)
      const text = request.method === 'POST' ? await request.text() : ''
      const entry: Seen = {
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        authorization: request.headers.get('authorization'),
        ...(text !== '' ? { body: JSON.parse(text) } : {}),
      }
      seen.push(entry)
      return answer(entry)
    },
  })
  base = `http://127.0.0.1:${server.port}/iam/api/runtime`
})

afterAll(() => server.stop(true))

const lastSeen = (): Seen => seen[seen.length - 1]

const runtimeOf = async (token: string, metadata?: Record<string, unknown>) => {
  const env = await start(metadata ?? { [IAM_API_METADATA]: `${base}/` })
  await seedSession(env.context, token)

  return { ...env, client: makeIamRuntimeClient(env.context, requestOf(token)) }
}

describe('@owlmeans/server-iam — iamRuntime', () => {
  test('calls the base the provider advertises, as the session subject', async () => {
    const { client } = await runtimeOf('runtime-1')
    answer = () => Response.json({ items: [{ entitySlug: 'acme', owner: true, home: true }] })

    expect(await client.organizations.list()).toEqual([{ entitySlug: 'acme', owner: true, home: true }])
    expect(lastSeen()).toEqual({
      method: 'GET', path: '/iam/api/runtime/organizations', query: {}, authorization: `Bearer ${ACCESS_TOKEN}`,
    })
  })

  test('discovery is read once per client', async () => {
    const { client, provider } = await runtimeOf('runtime-2')
    answer = () => Response.json({ items: [] })

    await client.organizations.list()
    await client.members.list('acme')
    await client.permissions.list('acme')
    expect(provider.getClientCalls).toBe(1)
  })

  test.each([
    ['create', (c: Client) => c.organizations.create({ title: 'Gamma' }), 'POST', '/organizations', { title: 'Gamma' }],
    ['update', (c: Client) => c.organizations.update('acme', { title: 'Acme' }), 'POST', '/organizations/acme', { title: 'Acme' }],
    ['add', (c: Client) => c.members.add('acme', { email: 'a@example.test', owner: false }),
      'POST', '/organizations/acme/members', { email: 'a@example.test', owner: false }],
    ['member update', (c: Client) => c.members.update('acme', 'acme-preview:sub', { groups: ['staff'] }),
      'POST', '/organizations/acme/members/acme-preview%3Asub', { groups: ['staff'] }],
    ['remove', (c: Client) => c.members.remove('acme', 'acme-preview:sub'),
      'POST', '/organizations/acme/members/acme-preview%3Asub/remove', {}],
    ['assign', (c: Client) => c.grants.assign('acme', { profileId: 'acme-preview:sub', permission: 'order--edit' }),
      'POST', '/organizations/acme/grants', { profileId: 'acme-preview:sub', permission: 'order--edit' }],
    ['revoke', (c: Client) => c.grants.revoke('acme', {
      profileId: 'acme-preview:sub', permission: 'order--edit', mode: IamGrantMode.All,
    }), 'POST', '/organizations/acme/grants/revoke', { profileId: 'acme-preview:sub', permission: 'order--edit', mode: 'all' }],
  ] as const)('%s: method, path and body', async (_, run, method, path, body) => {
    const { client } = await runtimeOf(`runtime-call-${path}`)
    answer = () => Response.json({ ok: true, entitySlug: 'acme', owner: true, profileId: 'acme-preview:sub', groups: [] })

    await run(client)
    expect(lastSeen()).toMatchObject({ method, path: `/iam/api/runtime${path}`, body, authorization: `Bearer ${ACCESS_TOKEN}` })
  })

  test('a grant listing sends its filter as the query and answers the items', async () => {
    const { client } = await runtimeOf('runtime-3')
    const grant = { profileId: 'acme-preview:sub', permission: 'order--edit', origin: IamGrantOrigin.Group, through: 'staff' }
    answer = () => Response.json({ items: [grant] })

    expect(await client.grants.list('acme', { profileId: 'acme-preview:sub' })).toEqual([grant])
    expect(lastSeen()).toMatchObject({ method: 'GET', path: '/iam/api/runtime/organizations/acme/grants', query: { profileId: 'acme-preview:sub' } })
  })

  test('a bare 403 on an owner route is the owner refusal, on a member route the organization refusal', async () => {
    const { client } = await runtimeOf('runtime-4')
    answer = () => new Response('incident-1', { status: 403, headers: { 'X-Incident-ID': 'incident-1' } })

    const write = client.members.add('acme', { email: 'a@example.test' })
    await expect(write).rejects.toBeInstanceOf(AuthForbidden)
    await expect(write).rejects.toThrow(ORGANIZATION_OWNER_REFUSAL)
    await expect(write.catch(error => error.incidentId)).resolves.toBe('incident-1')

    const read = client.members.list('beta')
    await expect(read).rejects.toBeInstanceOf(AuthForbidden)
    await expect(read.catch(error => (error as Error).message.includes(ORGANIZATION_OWNER_REFUSAL))).resolves.toBe(false)
    await expect(read).rejects.toThrow(ORGANIZATION_REFUSAL)
  })

  test('a marshalled error is rebuilt into its own class', async () => {
    const { client } = await runtimeOf('runtime-5')
    const marshalled = ResilientError.marshal(new AuthForbidden(ORGANIZATION_OWNER_REFUSAL)).message
    answer = () => new Response(marshalled, { status: 403 })

    const attempt = client.grants.assign('acme', { profileId: 'acme-preview:sub', permission: 'order--edit' })
    await expect(attempt).rejects.toBeInstanceOf(AuthForbidden)
    await expect(attempt).rejects.toThrow(ORGANIZATION_OWNER_REFUSAL)
  })

  test('a 401 is a session to sign in again; any other failure an IAM error', async () => {
    const { client } = await runtimeOf('runtime-6')

    answer = () => new Response('incident-2', { status: 401 })
    const unauthorized = client.organizations.list()
    await expect(unauthorized).rejects.toBeInstanceOf(AuthorizationError)
    await expect(unauthorized).rejects.not.toBeInstanceOf(AuthForbidden)

    answer = () => new Response('incident-3', { status: 502 })
    await expect(client.organizations.list()).rejects.toBeInstanceOf(IamError)
  })

  test('a provider that advertises no runtime API is a client error, and is asked again next time', async () => {
    const { client, provider } = await runtimeOf('runtime-7', {})

    await expect(client.organizations.list()).rejects.toBeInstanceOf(IamClientError)
    provider.metadata[IAM_API_METADATA] = base
    answer = () => Response.json({ items: [] })
    expect(await client.organizations.list()).toEqual([])
    expect(provider.getClientCalls).toBe(2)
  })

  test('a session without a provider token is refused before anything is sent', async () => {
    const env = await start({ [IAM_API_METADATA]: base })
    await seedSession(env.context, 'runtime-8', { payload: { token_type: 'Bearer' } })
    const before = seen.length

    await expect(makeIamRuntimeClient(env.context, requestOf('runtime-8')).organizations.list()).rejects.toBeInstanceOf(AuthForbidden)
    expect(seen.length).toBe(before)
  })
})

type Client = IamRuntimeClient
