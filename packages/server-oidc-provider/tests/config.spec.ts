import { describe, it, expect } from 'bun:test'
import { generateKeyPairSync } from 'node:crypto'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import {
  IAM_API_METADATA, ORGANIZATIONS_CLAIM, ORGANIZATIONS_SCOPE, PERMISSIONS_CLAIM, PERMISSIONS_SCOPE,
} from '@owlmeans/oidc'
import { makeOidcConfigUtils } from '../src/utils/config.js'
import type { Config } from '../src/types.js'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const TEST_PKCS8_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const makeTestContext = (oidc: Partial<Config['oidc']> = {}) => {
  const cfg: Config = {
    ready: false,
    service: 'server-oidc-provider-tests',
    type: AppType.Backend,
    services: {
      'iam-api': { alias: 'iam-api', host: 'iam.example.test', type: AppType.Backend, service: 'iam-api' },
    },
    debug: { all: false },
    oidc: {
      clients: [],
      defaultKeys: {
        RS256: { pk: TEST_PKCS8_PEM },
      },
      ...oidc,
    },
  } as unknown as Config

  return makeBasicContext(cfg) as BasicContext<Config>
}

describe('combineConfig (jose v6 extractable key)', () => {
  it('produces a JWKS with an RS256 key', async () => {
    const context = makeTestContext()
    const config = await makeOidcConfigUtils(context as any).combineConfig(true)

    expect(config.jwks).toBeDefined()
    expect(Array.isArray(config.jwks?.keys)).toBe(true)
    const keys = config.jwks?.keys ?? []
    expect(keys.length).toBeGreaterThan(0)
    expect(keys[0].kty).toBe('RSA')
  })
})

describe('combineConfig — scopes and the claims behind them', () => {
  it('maps each integrated-IAM scope to its own claim', async () => {
    const config = await makeOidcConfigUtils(makeTestContext() as any).combineConfig(true)

    expect(config.claims?.[PERMISSIONS_SCOPE]).toEqual([PERMISSIONS_CLAIM])
    expect(config.claims?.[ORGANIZATIONS_SCOPE]).toEqual([ORGANIZATIONS_CLAIM])
    expect(config.scopes).toContain(ORGANIZATIONS_SCOPE)
    expect(config.scopes).toContain(PERMISSIONS_SCOPE)
  })
})

describe('combineConfig — the discovery document', () => {
  it('expands a service-relative field against the registered service', async () => {
    const config = await makeOidcConfigUtils(makeTestContext({
      discoveryUris: { [IAM_API_METADATA]: '{{iam-api}}/iam/api/runtime' },
    }) as any).combineConfig(true)

    expect((config.discovery as Record<string, unknown>)[IAM_API_METADATA])
      .toBe('https://iam.example.test/iam/api/runtime')
  })

  it('keeps an absolute field and the custom discovery fields as given', async () => {
    const config = await makeOidcConfigUtils(makeTestContext({
      discoveryUris: { [IAM_API_METADATA]: 'https://elsewhere.example.test/runtime' },
      customConfiguration: { discovery: { service_documentation: 'https://docs.example.test' } },
    }) as any).combineConfig(true)

    expect(config.discovery).toEqual({
      service_documentation: 'https://docs.example.test',
      [IAM_API_METADATA]: 'https://elsewhere.example.test/runtime',
    })
  })
})

describe('combineConfig — pairwise subjects pass through', () => {
  it('keeps the subject options of the custom configuration', async () => {
    const pairwiseIdentifier = async (_: unknown, accountId: string) => `pairwise:${accountId}`
    const sectorIdentifierUriValidate = () => false
    const config = await makeOidcConfigUtils(makeTestContext({
      customConfiguration: { subjectTypes: ['pairwise'], pairwiseIdentifier, sectorIdentifierUriValidate },
    }) as any).combineConfig(true)

    expect(config.subjectTypes).toEqual(['pairwise'])
    expect(config.pairwiseIdentifier).toBe(pairwiseIdentifier)
    expect(config.sectorIdentifierUriValidate).toBe(sectorIdentifierUriValidate)
  })
})
