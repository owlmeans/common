import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { LLM_SERVICE } from './consts.js'
import { LlmMissconfiguredError } from './errors.js'
import { resolvePlugin } from './plugins/index.js'
import type { LlmService, LlmServiceOptions, ModelConfig, WithLlmService } from './types.js'

/** The part of {@link LlmService} this package implements — see {@link llmServiceApi}. */
export type LlmServiceApi = Pick<LlmService, 'models' | 'callbacks' | 'addCallbacks' | 'getModel' | 'configs'>

/**
 * Build the model-factory half of an LLM service, WITHOUT registering it as a context
 * service. Spread it into your own `createService` implementation to publish extra
 * methods (role-named accessors, domain helpers) alongside it:
 *
 * ```ts
 * const service = createService<MyService>(alias, {
 *   ...llmServiceApi(options, () => service),
 *   getPicker: override => service.getModel(MyRole.Picker, override),
 * } as MyService)
 * ```
 *
 * `self` is a late-bound reference to the finished service, because the methods read
 * mutable state (`models`, `callbacks`) off the registered instance rather than the
 * literal.
 */
export const llmServiceApi = (options: LlmServiceOptions, self: () => LlmService): LlmServiceApi => {

  /** Build one client from a fully-resolved config — no preset/fallback logic here. */
  const buildModel = (alias: string, config: ModelConfig): BaseChatModel => {
    if (config.provider == null || config.secret == null) {
      throw new LlmMissconfiguredError(alias)
    }
    const { secret, ...rest } = config
    return resolvePlugin(rest).build({
      alias, config: rest as ModelConfig, secret, callbacks: self().callbacks,
    })
  }

  /**
   * Resolve `alias` → config (inheriting a `preset`, applying `override`) and build it.
   * A declared `fallback` is built as well and attached to the primary as a
   * non-enumerable `__fallbackModel`, which the model's retry escalator reads. The
   * fallback spec is merged OVER the primary config, so it inherits secret/headers.
   */
  const createModel = (alias: string, override: Partial<ModelConfig> = {}): BaseChatModel => {
    const models = options.models()
    const baseConfig = models.find(m => m.alias === alias)
    if (baseConfig == null) {
      throw new LlmMissconfiguredError(alias)
    }
    const config: ModelConfig = { ...baseConfig, ...override }
    // The service-wide idle deadline is a floor, not an override: a preset that states its
    // own `streamTimeout` knows something specific about that model and keeps it.
    config.streamTimeout ??= options.streamTimeout
    const preset: Partial<ModelConfig> = config.preset != null
      ? { ...(models.find(m => m.alias === config.preset) ?? {}) }
      : {}
    if (preset.alias != null) {
      delete preset.alias
    }
    Object.assign(config, preset)

    const { fallback, ...primaryConfig } = config
    const primary = buildModel(alias, primaryConfig)
    if (fallback != null) {
      const { fallback: _nested, ...fallbackConfig } = { ...primaryConfig, ...fallback }
      Object.defineProperty(primary, '__fallbackModel', {
        value: buildModel(alias, fallbackConfig),
        enumerable: false,
        configurable: true,
      })
    }

    return primary
  }

  const cacheKey = (alias: string, override: Partial<ModelConfig> = {}): string =>
    `${alias}:${JSON.stringify(override)}`

  return {
    models: new Map(),

    callbacks: [],

    addCallbacks: callbacks => {
      self().callbacks.push(...callbacks)
    },

    configs: () => options.models(),

    getModel: (alias, override = {}, createNew = false) => {
      const service = self()
      const key = cacheKey(alias, override)
      const model = createNew || !service.models.has(key)
        ? createModel(alias, override)
        : service.models.get(key)!
      if (!createNew) {
        service.models.set(key, model)
      }

      return model
    },
  }
}

export const makeLlmService = (options: LlmServiceOptions, alias: string = LLM_SERVICE): LlmService => {
  const service: LlmService = createService<LlmService>(
    alias, llmServiceApi(options, () => service) as LlmService
  )

  return service
}

export const appendLlmService = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T,
  options: LlmServiceOptions,
  alias: string = LLM_SERVICE
): T & WithLlmService => {
  const context = ctx as T & WithLlmService

  context.registerService(makeLlmService(options, alias))

  context.llm = () => ctx.service(alias)

  return context
}
