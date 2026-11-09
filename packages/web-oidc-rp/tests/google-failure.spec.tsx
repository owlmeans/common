import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FC } from 'react'
import { ACCESS_DENIED_KIND, ApiClientError, ServerCrashedError } from '@owlmeans/api'
import type { ResponseStatusCarrier } from '@owlmeans/api'
import { AuthenticationStage, AuthRefused } from '@owlmeans/auth'
import { AppType } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import { GOOGLE_CLIENT_AUTH } from '@owlmeans/oidc'
import { Context, makeClientContext } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import { makeControl } from '@owlmeans/client-auth/manager'
import type { AuthenticationRendererProps } from '@owlmeans/client-auth/manager'
import { googleClientPlugin } from '../src/auth/plugins/google-client.js'

/** A failed call as the API client rejects it: the error, stamped with the status and denial kind. */
const answered = <T extends Error>(error: T, status: number, denialKind?: string): T =>
  Object.assign(error, { responseStatus: status, denialKind } satisfies ResponseStatusCarrier)

const context = makeClientContext({
  ready: false, service: 'web-oidc-rp-tests', type: AppType.Frontend, services: {}, debug: {},
} as unknown as ClientConfig)

const Callback = googleClientPlugin.Implementation() as FC<AuthenticationRendererProps>

/** The Google page as the authentication screen renders it at `stage`, after `error` when given. */
const renderAt = async (stage: AuthenticationStage, error?: unknown): Promise<string> => {
  const control = makeControl(context)
  control.type = GOOGLE_CLIENT_AUTH
  if (error !== undefined) {
    // What the callback's catch does with a rejected exchange.
    await control.setError(error)
  }
  control.stage = stage

  return renderToStaticMarkup(<Context value={context}>
    <Callback type={GOOGLE_CLIENT_AUTH} stage={stage} control={control} params={{}} />
  </Context>)
}

describe('googleClientPlugin — the callback ends in a visible state', () => {
  test('a refused exchange is the phrased refusal and the way back, not a progress bar', async () => {
    const out = await renderAt(AuthenticationStage.Error, answered(new ApiClientError(`forbidden:${randomUUID()}`), 403, ACCESS_DENIED_KIND))

    expect(out).toContain('data-login-failure="refused"')
    expect(out).toContain('This account cannot sign in here.')
    expect(out).toContain('>Back to sign-in</button>')
    expect(out).not.toContain('role="progressbar"')
  })

  test('a banned account visible in a development body gets the precise sentence', async () => {
    const rebuilt = answered(ResilientError.ensure(ResilientError.marshal(new AuthRefused('account:disabled'))), 403, ACCESS_DENIED_KIND)
    const out = await renderAt(AuthenticationStage.Error, rebuilt)

    expect(out).toContain('data-login-failure="account-disabled"')
    expect(out).toContain('This account has been disabled and cannot sign in here.')
  })

  test('any other failure is the generic sentence with its reference and a retry', async () => {
    const incident = randomUUID()
    const out = await renderAt(AuthenticationStage.Error, answered(new ServerCrashedError(incident), 500))

    expect(out).toContain('data-login-failure="failed"')
    expect(out).toContain('Sign-in did not complete. Please try again.')
    expect(out).toContain(`Reference: ${incident}`)
    expect(out).toContain('>Try again</button>')
    expect(out).not.toContain('role="progressbar"')
  })

  test('the progress bar is only for an attempt still under way', async () => {
    const out = await renderAt(AuthenticationStage.Authentication)

    expect(out).toContain('role="progressbar"')
    expect(out).not.toContain('data-login-failure')
  })
})
