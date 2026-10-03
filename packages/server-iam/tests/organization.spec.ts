import { describe, expect, test } from 'bun:test'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import { ORGANIZATION_REFUSAL } from '@owlmeans/oidc'
import { organizationOf, organizationsOf } from '@owlmeans/server-iam'
import { ACME, BETA, requestOf, seedSession, start } from './context.js'

describe('@owlmeans/server-iam — organizations of the session', () => {
  test('organizationsOf answers every claimed organization as a request entity keyed by its IAM key', async () => {
    const { context } = await start()
    await seedSession(context, 'session-1')

    expect(await organizationsOf(context, requestOf('session-1'))).toEqual([
      { id: ACME.entityKey, slug: ACME.entitySlug, iamKey: ACME.entityKey },
      { id: BETA.entityKey, slug: BETA.entitySlug, iamKey: BETA.entityKey },
    ])
  })

  test('organizationOf resolves one by slug — not only the acting one', async () => {
    const { context } = await start()
    await seedSession(context, 'session-2')

    expect(await organizationOf(context, requestOf('session-2'), 'beta'))
      .toEqual({ id: 'beta-key', slug: 'beta', iamKey: 'beta-key' })
  })

  test('an organization the subject is not in is refused', async () => {
    const { context } = await start()
    await seedSession(context, 'session-3')

    const attempt = organizationOf(context, requestOf('session-3'), 'gamma')
    await expect(attempt).rejects.toBeInstanceOf(AuthForbidden)
    await expect(attempt).rejects.toThrow(ORGANIZATION_REFUSAL)
  })

  /** A client without the organizations scope keeps no acting organization: there is nothing to resolve. */
  test('a session that acts in no organization has none', async () => {
    const { context } = await start()
    await seedSession(context, 'session-4', { acting: undefined, entity: undefined })

    expect(await organizationsOf(context, requestOf('session-4'))).toEqual([])
    await expect(organizationOf(context, requestOf('session-4'), 'acme')).rejects.toBeInstanceOf(AuthForbidden)
  })

  test('a request without authentication, or whose session is gone, is a 401', async () => {
    const { context } = await start()

    await expect(organizationsOf(context, requestOf())).rejects.toBeInstanceOf(AuthorizationError)
    const gone = organizationOf(context, requestOf('never-signed-in'), 'acme')
    await expect(gone).rejects.toBeInstanceOf(AuthorizationError)
    await expect(gone).rejects.not.toBeInstanceOf(AuthForbidden)
  })
})
