import { AppType, Layer, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'

const baseConfig = (): BasicConfig => ({
  ready: false,
  service: 'test-context',
  layer: Layer.Service,
  type: AppType.Backend,
})

/**
 * Build a fresh real context for each spec. `@owlmeans/context` is the
 * lowest layer in the framework — its tests use no mocks and no test-auth
 * helpers. Provisioning the context is the only shared setup; specs test
 * its public API directly.
 */
export const makeTestCtx = (overrides: Partial<BasicConfig> = {}): BasicContext<BasicConfig> =>
  makeBasicContext({ ...baseConfig(), ...overrides })
