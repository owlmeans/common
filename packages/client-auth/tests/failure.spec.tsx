import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { renderToStaticMarkup } from 'react-dom/server'
import { ACCESS_DENIED_KIND, ApiClientError, ServerCrashedError } from '@owlmeans/api'
import type { ResponseStatusCarrier } from '@owlmeans/api'
import { AuthenFailed, AuthForbidden, AuthRefused, AuthenticationStage } from '@owlmeans/auth'
import { AppType } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import { LIB_NAMESPACE, i18nHelper } from '@owlmeans/i18n'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import {
  LoginFailureKind, LoginFailureView, loginFailureHelper, makeAuthTranslate,
} from '../src/login/index.js'
import type { LoginTranslate } from '../src/login/index.js'
import { makeControl } from '../src/manager/components/authentication/control.js'
import { makeTestContext } from './context.js'

/** A failed call as the API client rejects it: the error, stamped with the status and denial kind. */
const answered = <T extends Error>(error: T, status: number, denialKind?: string): T =>
  Object.assign(error, { responseStatus: status, denialKind } satisfies ResponseStatusCarrier)

/** A development body rebuilt into its class on the far side, as `@owlmeans/api` rebuilds it. */
const rebuilt = (error: ResilientError, status: number, denialKind?: string): ResilientError =>
  answered(ResilientError.ensure(ResilientError.marshal(error)), status, denialKind)

/** The registered `auth` bundle of a language, resolved the way i18next resolves a dotted key. */
const translateOf = (lng: string): LoginTranslate => {
  const bundle = i18nHelper.resolveI18nResource(lng, 'auth', LIB_NAMESPACE) ?? {}

  return (key, defaultValue) => {
    const found = key.split('.').reduce<unknown>(
      (node, part) => (node != null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      bundle,
    )

    return typeof found === 'string' ? found : defaultValue
  }
}

describe('loginFailureHelper — a refused sign-in', () => {
  // Production exposure: the body is the incident id alone, the status and the marker are the refusal.
  test('the labelled 403 is a refusal, phrased "This account cannot sign in here."', () => {
    const incident = randomUUID()
    const failure = loginFailureHelper.failureOf(answered(new ApiClientError(`forbidden:${incident}`), 403, ACCESS_DENIED_KIND))

    expect(failure).toMatchObject({ kind: LoginFailureKind.Refused, refused: true, key: 'login.error.refused' })
    expect(loginFailureHelper.phrase(failure)).toEqual({
      message: 'This account cannot sign in here.', incident: null, action: 'Back to sign-in',
    })
    // Development exposure rebuilds the class itself; a deployment's own refusal reads the same.
    expect(loginFailureHelper.failureOf(rebuilt(new AuthRefused('operator:refused'), 403, ACCESS_DENIED_KIND)).kind)
      .toBe(LoginFailureKind.Refused)
    expect(loginFailureHelper.isRefusal(new AuthRefused('operator:unknown-account'))).toBe(true)
  })

  test('a visible refusal code gets its precise sentence', () => {
    const account = loginFailureHelper.failureOf(rebuilt(new AuthRefused('account:disabled'), 403, ACCESS_DENIED_KIND))
    const profile = loginFailureHelper.failureOf(rebuilt(new AuthRefused('profile:disabled'), 403, ACCESS_DENIED_KIND))

    expect(account).toMatchObject({ kind: LoginFailureKind.AccountDisabled, refused: true })
    expect(loginFailureHelper.phrase(account).message).toBe('This account has been disabled and cannot sign in here.')
    expect(profile).toMatchObject({ kind: LoginFailureKind.ProfileDisabled, refused: true })
    expect(loginFailureHelper.phrase(profile).message).toContain('access to this application has been blocked')
    // A server still on `AuthenFailed`, and the integrated IAM finalizer's ban, name the same codes.
    expect(loginFailureHelper.failureOf(rebuilt(new AuthenFailed('account:disabled'), 500)).kind)
      .toBe(LoginFailureKind.AccountDisabled)
    expect(loginFailureHelper.failureOf(rebuilt(new AuthForbidden('account:disabled'), 403, ACCESS_DENIED_KIND)).kind)
      .toBe(LoginFailureKind.AccountDisabled)
  })
})

describe('loginFailureHelper — any other failure', () => {
  test('is worth a retry and carries the incident a person reports', () => {
    const incident = randomUUID()
    const crashed = loginFailureHelper.failureOf(answered(new ServerCrashedError(incident), 500))

    expect(crashed).toMatchObject({ kind: LoginFailureKind.Failed, refused: false, key: 'login.error.failed', incidentId: incident })
    expect(loginFailureHelper.phrase(crashed)).toEqual({
      message: 'Sign-in did not complete. Please try again.', incident: `Reference: ${incident}`, action: 'Try again',
    })
  })

  // Plan and entitlement refusals use 403 too, and a proxy's 403 carries no marker at all.
  test('a 403 without the marker, a failed challenge, a network error or nothing are no refusals', () => {
    for (const error of [
      answered(new ApiClientError('forbidden'), 403),
      rebuilt(new AuthenFailed('challenge'), 500),
      new AuthenFailed('account:disabled-later'),
      new Error('Network Error'),
      null,
      'forbidden',
    ]) {
      expect(loginFailureHelper.failureOf(error)).toMatchObject({ kind: LoginFailureKind.Failed, refused: false })
    }
  })

  test('phrases through the translate it is given — every shipped language has the keys', () => {
    const incident = randomUUID()
    const refused = loginFailureHelper.failureOf(new AuthRefused())
    const failed = loginFailureHelper.failureOf(answered(new ServerCrashedError(incident), 500))

    expect(loginFailureHelper.phrase(refused, translateOf('fr'))).toEqual({
      message: 'Ce compte ne peut pas se connecter ici.', incident: null, action: 'Retour à la connexion',
    })
    expect(loginFailureHelper.phrase(failed, translateOf('de')).incident).toBe(`Referenz: ${incident}`)
    for (const lng of ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr']) {
      const translate = translateOf(lng)
      for (const key of ['refused', 'account-disabled', 'profile-disabled', 'failed', 'retry', 'back', 'incident']) {
        expect({ lng, key, found: translate(`login.error.${key}`, '') !== '' }).toEqual({ lng, key, found: true })
      }
    }
  })
})

describe('makeAuthTranslate — the `auth` keys with no React context', () => {
  test('reads the app\'s i18next instance, and an app override of a key wins', () => {
    // Registered before the slot is first drained — exactly how an application overrides it.
    i18nHelper.addI18nApp('en', 'auth', { login: { error: { refused: 'Not with this account.' } } }, { ns: LIB_NAMESPACE })
    const cfg = { ready: false, service: 'client-auth-tests', type: AppType.Frontend, services: {} } as unknown as ClientConfig
    const translate = makeAuthTranslate(cfg)

    expect(loginFailureHelper.phrase(loginFailureHelper.failureOf(new AuthRefused()), translate))
      .toEqual({ message: 'Not with this account.', incident: null, action: 'Back to sign-in' })
    expect(translate('login.error.failed', 'missing')).toBe('Sign-in did not complete. Please try again.')
  })
})

describe('LoginFailureView — the end state of a failed sign-in', () => {
  const html = (node: unknown): string => renderToStaticMarkup(<>{node as never}</>)

  test('a refusal: one phrased sentence and the way back, no reference', () => {
    const out = html(<LoginFailureView
      failure={loginFailureHelper.failureOf(rebuilt(new AuthRefused('account:disabled'), 403, ACCESS_DENIED_KIND))}
      onAction={() => {}}
    />)

    expect(out).toContain('role="alert"')
    expect(out).toContain('data-login-failure="account-disabled"')
    expect(out).toContain('data-login-refused="true"')
    expect(out).toContain('This account has been disabled and cannot sign in here.')
    expect(out).toContain('>Back to sign-in</button>')
    expect(out).not.toContain('data-login-failure-incident')
    expect(out).not.toContain('auth:manager')
  })

  test('a failure: the generic sentence, its reference and a retry — a button only with an action', () => {
    const incident = randomUUID()
    const failure = loginFailureHelper.failureOf(answered(new ServerCrashedError(incident), 500))

    const out = html(<LoginFailureView failure={failure} onAction={() => {}} page />)
    expect(out).toContain('data-login-failure-page')
    expect(out).toContain('data-login-failure="failed"')
    expect(out).toContain('Sign-in did not complete. Please try again.')
    expect(out).toContain(`Reference: ${incident}`)
    expect(out).toContain('>Try again</button>')

    expect(html(<LoginFailureView failure={failure} />)).not.toContain('<button')
  })
})

describe('the authentication control keeps what a failure view reads', () => {
  // The Google callback and the supervisor form end in `setError`: the stage moves to Error, and
  // the stamped status and marker of the API client's rejection survive `ResilientError.ensure`.
  test('setError moves to the Error stage with the refusal intact', async () => {
    const stages: AuthenticationStage[] = []
    const control = makeControl(makeTestContext() as unknown as ClientContext<ClientConfig>)
    control.setStage = stage => { stages.push(stage) }

    await control.setError(answered(new ApiClientError(`forbidden:${randomUUID()}`), 403, ACCESS_DENIED_KIND))

    expect(control.stage).toBe(AuthenticationStage.Error)
    expect(stages).toEqual([AuthenticationStage.Error])
    expect(loginFailureHelper.failureOf(control.error).kind).toBe(LoginFailureKind.Refused)
  })
})
