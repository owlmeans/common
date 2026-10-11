import type { ModelConfig } from '../types.js'
import { PROVIDER_NEUTRAL_FIELDS } from './consts.js'

const neutral = (config: ModelConfig): Partial<ModelConfig> =>
  Object.fromEntries(
    PROVIDER_NEUTRAL_FIELDS.filter(key => config[key] !== undefined).map(key => [key, config[key]])
  ) as Partial<ModelConfig>

/**
 * Every config a role can be escalated through, fully merged, primary first; none keeps a
 * `fallback`. This is exactly what `LlmService.getModel` builds, so a preset check or a price
 * list that walks it sees the same models the escalator will call.
 *
 * Each `fallback` is merged over the rung above it and may carry its own, which chains. A
 * fallback on the same provider inherits every field it does not name; one naming another
 * `provider` inherits only {@link PROVIDER_NEUTRAL_FIELDS}.
 */
export const resolveFallbacks = (config: ModelConfig): ModelConfig[] => {
  const rungs: ModelConfig[] = []
  let patch: Partial<ModelConfig> | undefined = config
  while (patch != null) {
    const next: Partial<ModelConfig> | undefined = patch.fallback
    const { fallback: _chained, ...own } = patch
    const above = rungs[rungs.length - 1]
    const base = above == null
      ? {}
      : own.provider != null && own.provider !== above.provider ? neutral(above) : above
    rungs.push({ ...base, ...own, alias: config.alias } as ModelConfig)
    patch = next
  }

  return rungs
}
