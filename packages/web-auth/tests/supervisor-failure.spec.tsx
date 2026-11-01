import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FC } from 'react'
import { ACCESS_DENIED_KIND, ApiClientError, ServerCrashedError } from '@owlmeans/api'
import type { ResponseStatusCarrier } from '@owlmeans/api'
import { AuthenticationStage, AuthenticationType, AuthRefused } from '@owlmeans/auth'
import { AppType } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import { Context, makeClientContext } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import { makeControl } from '@owlmeans/client-auth/manager'
import type { AuthenticationRendererProps } from '@owlmeans/client-auth/manager'
import { supervisorClientPlugin } from '../src/index.js'

/** A failed call as the API client rejects it: the error, stamped with the status and denial kind. */
const answered = <T extends Error>(error: T, status: number, denialKind?: string): T =>
  Object.assign(error, { responseStatus: status, denialKind } satisfies ResponseStatusCarrier)

const context = makeClientContext({
  ready: false, service: 'web-auth-tests', type: AppType.Frontend, services: {}, debug: {},
} as unknown as ClientConfig)

const Form = supervisorClientPlugin.Implementation() as FC<AuthenticationRendererProps>

/** The form as the authentication screen renders it after a submit that ended in `error`. */
const renderFailed = async (error?: unknown, stage = AuthenticationStage.Error): Promise<string> => {
  const control = makeControl(context)
  control.type = AuthenticationType.Supervisor
  if (error !== undefined) {
    await control.setError(error)
  }
  control.stage = stage

  return renderToStaticMarkup(<Context value={context}>
    <Form type={AuthenticationType.Supervisor} stage={stage} control={control} params={{}} />
  </Context>)
}

describe('supervisorClientPlugin — a failed submit ends phrased', () => {
  test('a refusal reads "This account cannot sign in here.", never the raw message', async () => {
    const out = await renderFailed(answered(new ApiClientError(`forbidden:${randomUUID()}`), 403, ACCESS_DENIED_KIND))

    expect(out).toContain('data-testid="supervisor-error"')
    expect(out).toContain('data-login-failure="refused"')
    expect(out).toContain('This account cannot sign in here.')
    expect(out).not.toContain('api:client')
  })

  test('a visible refusal code gets its precise sentence', async () => {
    const rebuilt = answered(ResilientError.ensure(ResilientError.marshal(new AuthRefused('profile:disabled'))), 403, ACCESS_DENIED_KIND)
    const out = await renderFailed(rebuilt)

    expect(out).toContain('data-login-failure="profile-disabled"')
    expect(out).toContain('access to this application has been blocked')
    expect(out).not.toContain('auth:manager:authen')
  })

  test('anything else is the generic sentence with its reference, and the form stays to retry', async () => {
    const incident = randomUUID()
    const out = await renderFailed(answered(new ServerCrashedError(incident), 500))

    expect(out).toContain('data-login-failure="failed"')
    expect(out).toContain(`Sign-in did not complete. Please try again. Reference: ${incident}`)
    expect(out).toContain('Sign in as supervisor')
    expect(out).not.toContain('Signing in…')
  })

  test('no failure line outside the Error stage', async () => {
    expect(await renderFailed(undefined, AuthenticationStage.Init)).not.toContain('supervisor-error')
    expect(await renderFailed(new Error('stale'), AuthenticationStage.Allowence)).not.toContain('supervisor-error')
  })
})
