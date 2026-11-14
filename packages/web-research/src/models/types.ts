import type { JSONSchemaType } from 'ajv'
import type { ExecutionService, HelperExecution, LlmModel, LlmSpectator } from '@owlmeans/llm'
import type { ExecutionEffort, ModelRole } from '@owlmeans/llm-common'
import type { ReaderModels } from '@owlmeans/llm-reader'
import type { ResearchRole } from '../consts.js'

/**
 * One model request: the step's constant instruction (the cacheable lead message) and the material
 * it works on (the sources, the facts) — sent as two user messages, the persona coming from the
 * helper execution's prompt policy.
 */
export interface ResearchInput {
  instruction: string
  content: string
}

export interface ResearchCallOptions {
  /** The spectator label of the call (`research-plan`, `research-synthesize` …). */
  action: string
}

/**
 * Role-based model calls — the port every model-backed step goes through. Ship one with
 * `makeResearchModels(exec, …)` over an `@owlmeans/llm` execution, or `createResearchModels` over
 * ready models.
 */
export interface ResearchModels {
  /** A text answer (Markdown) at `role`. */
  text: (role: ResearchRole, input: ResearchInput, options: ResearchCallOptions) => Promise<string>
  /**
   * A structured answer at `role`, validated against `schema` with ajv — a mismatch throws
   * `ResearchModelError`.
   */
  json: <T>(role: ResearchRole, input: ResearchInput, schema: JSONSchemaType<T>, options: ResearchCallOptions) => Promise<T>
  /**
   * The models llm-reader's design analyst runs on — the `Analyst` role's. `undefined` when there are
   * none: a design is then written from the measured facts alone.
   */
  reader: () => ReaderModels | undefined
}

/** What `createResearchModels` builds on: a ready model per role, and its helper execution when there is one. */
export interface ResearchModelsOptions {
  model: (role: ResearchRole) => LlmModel
  /** The helper execution behind a role's model — llm-reader's DOM mode needs it; optional otherwise. */
  helper?: (role: ResearchRole) => HelperExecution | undefined
}

/** What `makeResearchModels` refines the caller's execution with — the same shape as llm-reader's `makeReaderModels`. */
export interface MakeResearchModelsOptions {
  /** The service that refines the execution into helpers. */
  executions: ExecutionService
  /** Model role (alias) per research role; the research role's own name for any not named. */
  roles?: Partial<Record<ResearchRole, ModelRole>>
  /** A local effort per role. */
  efforts?: Partial<Record<ResearchRole, ExecutionEffort>>
  /** The initial output budget per role; `RESEARCH_OUTPUT_TOKENS` for any not named. */
  outputs?: Partial<Record<ResearchRole, number>>
  /** Records every call; a silent sink when omitted. */
  spectator?: LlmSpectator
}
