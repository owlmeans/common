import { describe, it, expect } from 'bun:test'
import { generateKeyPairSync } from 'node:crypto'
import { AppType, Layer, makeBasicContext } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { combineConfig } from '../src/utils/config.js'
import type { Config } from '../src/types.js'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const TEST_PKCS8_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const makeTestContext = () => {
  const cfg: Config = {
    ready: false,
    service: 'server-oidc-provider-tests',
    layer: Layer.Service,
    type: AppType.Backend,
    services: {},
    debug: { all: false },
    oidc: {
      clients: [],
      defaultKeys: {
        RS256: { pk: TEST_PKCS8_PEM },
      },
    },
  } as unknown as Config

  return makeBasicContext(cfg) as BasicContext<Config>
}

describe('combineConfig (jose v6 extractable key)', () => {
  it('produces a JWKS with an RS256 key', async () => {
    const context = makeTestContext()
    const config = await combineConfig(context as any, true)

    expect(config.jwks).toBeDefined()
    expect(Array.isArray(config.jwks?.keys)).toBe(true)
    const keys = config.jwks?.keys ?? []
    expect(keys.length).toBeGreaterThan(0)
    expect(keys[0].kty).toBe('RSA')
  })
})
