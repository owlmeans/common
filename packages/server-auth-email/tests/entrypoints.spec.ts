import { describe, expect, test } from 'bun:test'
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import { makeEmailAuthProtocols } from '@owlmeans/auth-email'
import { serveEmailAuthEntrypoints } from '../src/entrypoints.js'
import { makeEmailAuthFixture } from './context.js'

const protocols = makeEmailAuthProtocols({ guards: 'guard:default', gate: { alias: 'gate:app' } })

/** Run a bound route the way the API server does: registered on the context, answered through its `handle`. */
const invoke = async (binding: { handle?: unknown }, req: unknown): Promise<unknown> => {
  const res: { value?: unknown, error?: Error, resolve: (value: unknown) => void, reject: (error: Error) => void } = {
    resolve: value => { res.value = value }, reject: error => { res.error = error },
  }
  await (binding.handle as (req: unknown, res: unknown) => Promise<unknown>)(req, res)
  if (res.error != null) throw res.error

  return res.value
}

describe('@owlmeans/server-auth-email — serveEmailAuthEntrypoints', () => {
  test('binds the three parents and every server route of the tree — never the offer screen', () => {
    const bindings = serveEmailAuthEntrypoints(protocols)
    const bound = bindings.map(binding => binding.protocol)

    expect(bindings).toHaveLength(14)
    expect(bound).toContain(protocols.base)
    expect(bound).toContain(protocols.password.base)
    expect(bound).toContain(protocols.password.devicePin)
    expect(bound).toContain(protocols.tech.base)
    expect(bound).not.toContain(protocols.offer)
    // The developer routes keep their declared guard; the guest routes have none.
    const guardsOf = (protocol: unknown) => bindings.find(binding => binding.protocol === protocol)!.guards
    expect(guardsOf(protocols.tech.base)).toEqual([GUARD_ED25519])
    expect(guardsOf(protocols.password.base)).toEqual(['guard:default'])
    expect(guardsOf(protocols.base)).toEqual([])
  })

  test('a bound route calls the service', async () => {
    const env = await makeEmailAuthFixture()
    const bindings = serveEmailAuthEntrypoints(protocols)
    env.context.registerEntrypoints(bindings as never)
    const options = bindings.find(binding => binding.protocol === protocols.options)!
    const pin = bindings.find(binding => binding.protocol === protocols.pin)!

    expect(await invoke(options, env.guest())).toEqual({ password: true, captcha: null, pinLength: 6 })
    expect(await invoke(pin, env.guest({ body: { email: 'route@example.org' } })))
      .toHaveProperty('challenge')
    expect(env.mailer.captured.at(-1)!.to).toBe('route@example.org')
  })
})
