import type { RungCapabilities } from '@owlmeans/llm-common'
import { rungUtils } from '../utils/rungs.js'
import type { CapabilityHelper } from './capabilities/types.js'

export const createCapabilityHelper = (): CapabilityHelper => {
  const fromConfigs: CapabilityHelper['fromConfigs'] = configs => {
    const rungs = configs.map((config): RungCapabilities => ({
      ...(config.model != null ? { model: config.model } : {}),
      ...(config.provider != null ? { provider: config.provider } : {}),
      vision: config.vision === true,
      documents: config.documents === true,
    }))

    return {
      vision: rungs.some(rung => rung.vision),
      documents: rungs.some(rung => rung.documents),
      rungs,
    }
  }

  const of: CapabilityHelper['of'] = model => fromConfigs(rungUtils.rungsOf(model).map(rung => rung.config))

  const accepts: CapabilityHelper['accepts'] = (capabilities, needs) =>
    capabilities.rungs.some(rung => (needs.vision !== true || rung.vision) && (needs.documents !== true || rung.documents))

  const ladder: CapabilityHelper['ladder'] = model => rungUtils.rungsOf(model).map(rung => rung.model)

  return { of, fromConfigs, accepts, ladder }
}

export const capabilityHelper = createCapabilityHelper()
