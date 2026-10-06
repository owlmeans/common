import type { Page } from 'playwright'
import { type Auth, type AuthCredentials, AuthroizationType, AuthRole as Role, AuthenticationType, buildSupervisorPayload } from '@owlmeans/auth'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { createIdOfLength } from '@owlmeans/basic-ids'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { makeBearer } from '@owlmeans/test-auth'
import { makePageHelper } from './page.js'
import type { AcceptConsentOptions, SupervisorFormLoginOptions } from './page/types.js'
import type { PregenerateAuthTokenOptions, SupervisorApiAuthOptions, SupervisorAuthHelper } from './supervisor/types.js'

export const createSupervisorAuthHelper = (): SupervisorAuthHelper => {
  const pregenerateAuthToken = async (opts: PregenerateAuthTokenOptions): Promise<string> => {
    const auth: Auth = {
      token: createIdOfLength(32),
      userId: opts.userId,
      profileId: opts.profileId ?? opts.userId,
      entitySlug: opts.entityId,
      scopes: opts.scopes ?? ['*'],
      role: opts.role ?? Role.User,
      type: AuthroizationType.Ed25519BasicToken,
      source: opts.source ?? '',
      isUser: true,
      createdAt: new Date()
    }

    return makeBearer(auth, makeKeyPairModel(opts.pk))
  }

  const postJson = async (
    fetchImpl: typeof fetch, url: string, body: unknown
  ): Promise<any> => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      throw new Error(`supervisor api ${url} -> ${res.status} ${await res.text().catch(() => '')}`)
    }
    return res.json()
  }

  const authenticateViaSupervisorApi = async (
    opts: SupervisorApiAuthOptions
  ): Promise<string> => {
    const fetchImpl = opts.fetchImpl ?? fetch
    const base = opts.apiBaseUrl.replace(/\/$/, '')
    const initPath = opts.paths?.init ?? '/authentication/init'
    const authPath = opts.paths?.authenticate ?? '/authentication/authenticate'
    const dispatchPath = opts.paths?.dispatch ?? '/authenticate'

    // 1. Ask the auth manager for a fresh, signed challenge envelope.
    const { challenge } = await postJson(fetchImpl, base + initPath, {
      type: AuthenticationType.Supervisor
    }) as { challenge: string }

    // 2. Sign the unwrapped challenge + userId + salt with the supervisor key.
    const challengeMsg = makeEnvelopeModel<string>(challenge, EnvelopeKind.Wrap).message()
    const salt = createIdOfLength(16)
    const signature = await makeKeyPairModel(opts.pk)
      .sign(buildSupervisorPayload(challengeMsg, opts.userId, salt))

    const credentials: AuthCredentials = {
      type: AuthenticationType.Supervisor,
      challenge,
      credential: JSON.stringify({ salt, signature }),
      userId: opts.userId,
      role: Role.User,
      scopes: ['*']
    }

    // 3. Exchange for the intermediate auth-manager token.
    const intermediate = await postJson(fetchImpl, base + authPath, credentials) as { token: string }

    // 4. Exchange the intermediate token for the final project bearer.
    const final = await postJson(fetchImpl, base + dispatchPath, { token: intermediate.token }) as { token: string }

    return final.token
  }

  return { pregenerateAuthToken, authenticateViaSupervisorApi }
}

export const supervisorAuthHelper = createSupervisorAuthHelper()

/** @deprecated compat:factory-refactor — use `supervisorAuthHelper.authenticateViaSupervisorApi(…)` */
export const authenticateViaSupervisorApi = async (opts: SupervisorApiAuthOptions): Promise<string> =>
  await supervisorAuthHelper.authenticateViaSupervisorApi(opts)

/** @deprecated compat:factory-refactor — use `makePageHelper(page).saveScreenshot(…)` */
export const saveScreenshot = async (page: Page, dir: string, name: string): Promise<string> =>
  await makePageHelper(page).saveScreenshot(dir, name)

/** @deprecated compat:factory-refactor — use `makePageHelper(page).acceptConsent(…)` */
export const acceptConsent = async (page: Page, opts?: AcceptConsentOptions): Promise<boolean> =>
  await makePageHelper(page).acceptConsent(opts)

/** @deprecated compat:factory-refactor — use `makePageHelper(page).loginViaSupervisorForm(…)` */
export const loginViaSupervisorForm = async (page: Page, opts: SupervisorFormLoginOptions): Promise<void> =>
  await makePageHelper(page).loginViaSupervisorForm(opts)
