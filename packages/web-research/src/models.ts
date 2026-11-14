import { Ajv } from 'ajv'
import type { JSONSchemaType, ValidateFunction } from 'ajv'
import { makeLlmModel } from '@owlmeans/llm'
import type { Execution, HelperExecution, LlmModel, LlmSpectator, ModelInput } from '@owlmeans/llm'
import type { ReaderModels } from '@owlmeans/llm-reader'
import { ResearchRole } from './consts.js'
import { ResearchModelError } from './errors.js'
import { RESEARCH_OUTPUT_TOKENS, RESEARCH_PERSONAS } from './models/consts.js'
import type { MakeResearchModelsOptions, ResearchInput, ResearchModels, ResearchModelsOptions } from './models/types.js'

/** A sink that keeps nothing — research models with no spectator still satisfy the model's contract. */
const silent: LlmSpectator = {
  log: async arg => ({ id: '', kind: 'general', model: arg.model ?? '', purpose: { type: 'web-research' }, timestamp: Date.now(), ...arg }),
}

/**
 * Research models over ready models, one per role. The instruction is the lead message (`stable: 1`:
 * every call of one step repeats it byte for byte), the material the second; a structured answer is
 * validated with ajv on top of the model's own check, so a port built on any model returns the shape.
 */
export const createResearchModels = (options: ResearchModelsOptions): ResearchModels => {
  const ajv = new Ajv({ strict: false, allErrors: true })
  const validators = new WeakMap<object, ValidateFunction>()

  const messages = (input: ResearchInput): ModelInput => [
    { role: 'user', content: input.instruction },
    { role: 'user', content: input.content },
  ]

  const text: ResearchModels['text'] = async (role, input, call) =>
    (await options.model(role).ask(messages(input), { action: call.action, stable: 1 })).trim()

  const json: ResearchModels['json'] = async <T>(role: ResearchRole, input: ResearchInput, schema: JSONSchemaType<T>, call: { action: string }) => {
    const answer = await options.model(role).invoke<T>(messages(input), schema, { action: call.action, stable: 1 })
    let validate = validators.get(schema)
    if (validate == null) {
      validate = ajv.compile(schema)
      validators.set(schema, validate)
    }
    if (!validate(answer)) {
      throw new ResearchModelError(`${call.action}:${ajv.errorsText(validate.errors, { separator: '; ' })}`)
    }
    return answer
  }

  const reader = (): ReaderModels => ({
    model: () => options.model(ResearchRole.Analyst),
    helper: () => options.helper?.(ResearchRole.Analyst),
  })

  return { text, json, reader }
}

/**
 * Research models bound to the caller's execution: one helper execution per research role, refined
 * from it (model alias, persona, effort, output budget, `research:<role>` dedication) — so every call
 * runs on the model policy and spectator of the run it belongs to. Built on first use and kept.
 */
export const makeResearchModels = (exec: Execution, options: MakeResearchModelsOptions): ResearchModels => {
  const helpers = new Map<ResearchRole, HelperExecution>()
  const models = new Map<ResearchRole, LlmModel>()

  const helper = (role: ResearchRole): HelperExecution => {
    let found = helpers.get(role)
    if (found == null) {
      const effort = options.efforts?.[role]
      const output = options.outputs?.[role] ?? RESEARCH_OUTPUT_TOKENS[role]
      found = options.executions.forHelper(exec, {
        role: options.roles?.[role] ?? role,
        dedication: `research:${role}`,
        prompt: { role: RESEARCH_PERSONAS[role] },
        ...(effort != null ? { effort } : {}),
        ...(output != null ? { output } : {}),
      }) as HelperExecution
      helpers.set(role, found)
    }
    return found
  }

  const model = (role: ResearchRole): LlmModel => {
    let found = models.get(role)
    if (found == null) {
      // A helper execution is itself a complete set of model options: model, purpose, prompt policy.
      found = makeLlmModel(helper(role), options.spectator ?? silent)
      models.set(role, found)
    }
    return found
  }

  return createResearchModels({ model, helper })
}
