import { AppType, Layer, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { makeMemoryTrustedResource, makeFixtureKeyPair } from '@owlmeans/test-auth'
import type { TrustedRecord } from '@owlmeans/auth-common'
import type { KeyPairModel } from '@owlmeans/basic-keys'

export const TRUSTED_ALIAS = 'TRUSTED'

export interface TrustFixture {
  ctx: BasicContext<BasicConfig>
  authKey: KeyPairModel
  authRecord: TrustedRecord
}

/**
 * Build a real `BasicContext` with an in-memory TRUSTED resource pre-populated
 * with a single trusted user — mirroring the way viable apps populate
 * `cfg.trusted` (see /home/igor/projects/owlmeans/viable/sources/backend/src/config.ts:62-109).
 *
 * Returns the context, the fixture keypair we used to build the record, and
 * the record itself so specs can re-use them when asserting `trust()`'s return.
 */
export const makeTrustFixture = (
  options: { withSecret?: boolean, name?: string, seed?: string } = {}
): TrustFixture => {
  const seed = options.seed ?? 'auth-common-tests'
  const name = options.name ?? 'auth-service'
  const authKey = makeFixtureKeyPair(seed)

  const authRecord: TrustedRecord = {
    id: authKey.exportAddress(),
    name,
    credential: authKey.exportPublic(),
    ...(options.withSecret === true ? { secret: authKey.export() } : {}),
    scopes: ['*'],
  }

  const ctx = makeBasicContext<BasicConfig>({
    ready: false,
    service: 'auth-common-tests',
    layer: Layer.Service,
    type: AppType.Backend,
  })

  ctx.registerResource(makeMemoryTrustedResource([authRecord], TRUSTED_ALIAS))

  return { ctx, authKey, authRecord }
}
