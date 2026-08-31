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

  /** A named alias's config, ready to be layered under something else. */
  const presetOf = (
    models: ModelConfig[], name: string | undefined
  ): Partial<ModelConfig> => {
    if (name == null) return {}
    const { alias: _alias, ...rest } = { ...(models.find(m => m.alias === name) ?? {}) }
    return rest
  }

  /**
   * Drop keys that are present but `undefined` — they must not shadow a layer below.
   * `mergeOverride` in the execution layer strips these already; a hand-built override
   * need not.
   */
  const defined = (config: Partial<ModelConfig>): Partial<ModelConfig> =>
    Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined)
    ) as Partial<ModelConfig>

  /**
   * Resolve `alias` → config (inheriting a `preset`, applying `override`) and build it.
   * A declared `fallback` is built as well and attached to the primary as a
   * non-enumerable `__fallbackModel`, which the model's retry escalator reads. The
   * fallback spec is merged OVER the primary config, so it inherits secret/headers.
   *
   * Four layers, lowest first — the alias's own preset, the alias, the override's preset,
   * the override. A `preset` is a BASE that its referent refines, so it has to sit under
   * the config naming it; the previous order assigned it last, which meant a role
   * declaring `preset:` silently discarded both its own fields and the caller's override —
   * effort-tier token caps and `temperatureFactory`'s temperature among them. An override
   * naming a preset (how the execution layer delivers a `modelOverrides` string pin) still
   * outranks the alias, because picking a different model is a stronger statement than the
   * role's default; explicit override fields stay on top of everything.
   */
  const createModel = (alias: string, override: Partial<ModelConfig> = {}): BaseChatModel => {
    const models = options.models()
    const baseConfig = models.find(m => m.alias === alias)
    if (baseConfig == null) {
      throw new LlmMissconfiguredError(alias)
    }
    const config: ModelConfig = {
      ...presetOf(models, baseConfig.preset),
      ...defined(baseConfig),
      ...presetOf(models, override.preset),
      ...defined(override),
      alias: baseConfig.alias,
    }
    // The service-wide idle deadline is a floor, not an override: a preset that states its
    // own `streamTimeout` knows something specific about that model and keeps it.
    config.streamTimeout ??= options.streamTimeout

    // What the provider accepts bounds what we may ask for. A preset that over-declares is
    // corrected here rather than at the provider, where it surfaces as a fatal 400 on the
    // one call that finally escalated far enough to exceed the limit.
    if (config.maxOutput != null && config.maxOutput > 0) {
      if (config.maxTokensCap != null && config.maxTokensCap > config.maxOutput) {
        console.warn(
          `Model "${alias}" declares maxTokensCap ${config.maxTokensCap} above the provider's`
          + ` maxOutput ${config.maxOutput}; the escalator will stop at ${config.maxOutput}.`
        )
      }
      if (config.maxTokens != null && config.maxTokens > config.maxOutput) {
        console.warn(
          `Model "${alias}" declares maxTokens ${config.maxTokens} above the provider's`
          + ` maxOutput ${config.maxOutput}; clamping.`
        )
        config.maxTokens = config.maxOutput
      }
    }

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
