import type { ModelConfig } from '../../types.js'
import { ANTHROPIC_MODEL_SUPPORT, NO_SAMPLING_PREFIXES, ThinkingOff } from '../consts.js'
import type { AnthropicModelSupport } from '../types.js'
import type { AnthropicSupportHelper } from './support/types.js'

export const createAnthropicSupportHelper = (): AnthropicSupportHelper => {
  const rejectsSampling = (model: string | undefined): boolean =>
    model != null && NO_SAMPLING_PREFIXES.some(prefix => model.startsWith(prefix))

  const anthropicSupportOf = (model: string | undefined): AnthropicModelSupport | undefined =>
    model != null ? ANTHROPIC_MODEL_SUPPORT.find(entry => model.startsWith(entry.prefix)) : undefined

  const suppressesThinking = (config: Pick<ModelConfig, 'model' | 'disableThinking'>): boolean =>
    config.disableThinking === true && rejectsSampling(config.model)

  const thinkingOffFor = (config: Pick<ModelConfig, 'model' | 'disableThinking'>): ThinkingOff | undefined => {
    if (!suppressesThinking(config)) {
      return undefined
    }
    const off = anthropicSupportOf(config.model)?.thinkingOff

    return off === null ? undefined : off ?? ThinkingOff.Disabled
  }

  const rejectsForcedTool = (model: string | undefined): boolean =>
    anthropicSupportOf(model)?.rejectsForcedTool === true

  return { rejectsSampling, anthropicSupportOf, suppressesThinking, thinkingOffFor, rejectsForcedTool }
}

export const anthropicSupportHelper = createAnthropicSupportHelper()
