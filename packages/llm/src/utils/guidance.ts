import { logger } from '@owlmeans/log'
import { LlmSchemaRejection } from '../errors.js'
import { retryHelper } from '../helpers/retry.js'
import type { FatalErrorResolver } from '../helpers/retry/types.js'
import type { LlmGuide, ModelInput, ModelInputItem } from '../types.js'
import type { CallGuidance, GuidanceUtils } from './guidance/types.js'
import { refusalUtils } from './refusal.js'

const log = logger('llm')

export const createGuidanceUtils = (): GuidanceUtils => {
  const items = (input: ModelInput): ModelInputItem[] => Array.isArray(input) ? input : [input]

  const of = <T>(guide: LlmGuide<T> | undefined, action: string, fatal?: FatalErrorResolver): CallGuidance<T> => {
    let current: ModelInputItem[] = []

    return {
      active: () => current.length > 0,
      input: input => current.length === 0 ? input : [...items(input), ...current],
      refused: async (error, attempt, output, validated = output) => {
        // A fatal error ends the call: there is no next attempt to guide.
        if (retryHelper.isFatalError(error, fatal) != null) return error
        // A schema refusal nobody corrected still says what was wrong; a filter refusal is the caller's to explain.
        const fallback = (): ModelInputItem[] => error instanceof LlmSchemaRejection
          ? [refusalUtils.correctionOf(error.details, validated)]
          : []
        if (guide == null) {
          current = fallback()
          return error
        }
        try {
          const answer = await guide({ error, attempt, output })
          current = answer == null ? fallback() : items(answer)
        } catch (failure) {
          // The attempt's own error is what the caller sees; a broken guide only loses its message.
          log.warn('Model guide failed, the next attempt is asked without it', { action, attempt, error: failure })
          current = fallback()
        }

        return error
      },
    }
  }

  return { of }
}

export const guidanceUtils = createGuidanceUtils()
