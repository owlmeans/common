
/**
 * Level and effort tiers are owned by `@owlmeans/llm-common` — re-exported here so a
 * consumer of the viable contracts never needs a second import.
 */
export { ExecutionEffort, ExecutionLevel } from '@owlmeans/llm-common'

/**
 * Serializable role name for model selection. Lives in `common` so the platform,
 * the serialized execution state, and a future queue consumer can all name roles.
 *
 * The generic `ModelRole` in `@owlmeans/llm-common` is an open `string`; this enum is
 * viable's concrete instance of it.
 *
 * IMPORTANT: the string values mirror the library `ChatModelPurpose` enum
 * (`packages/library/src/consts.ts`) **value-for-value**. Keep the two in sync
 * until a later phase collapses `ChatModelPurpose` into an alias of `ModelRole`.
 */
export enum ModelRole {
  SeniorBA = 'senior-ba',
  MiddleBA = 'middle-ba',
  SeniorUIDeveloper = 'senior-ui-developer',
  ProduceManager = 'product-manager',
  MiddleDesigner = 'middle-designer',
  SeniorDesigner = 'senior-designer',
  StateArchitect = 'state-architect',
  MiddleDeveloper = 'middle-developer',
  SeniorDeveloper = 'senior-developer',
  ViewArchitect = 'view-architect',
  DataArchitect = 'data-architect',
  ApiArchitect = 'api-architect',
  NavigationArchitect = 'navigation-architect',
  BackendDomainArchitect = 'backend-domain-architect',
  DevOrchestrator = 'dev-orchestrator',
  Utility = 'utility',
  Picker = 'picker',
  /** The content gate's senior reviewer: judges what a person wrote, rewrites a refused text. */
  SecurityExpert = 'security-expert',
  /** The content gate's cheaper screen over text the platform drafted from a person's material. */
  JuniorSecurityExpert = 'junior-security-expert',
  /** Runs the provider-hosted web search of online research — a model with a search tool. */
  Researcher = 'researcher',
}

/**
 * How a run's pipeline steps do their work.
 *
 * `Linear` is the fixed recipe: code decides every input, each helper makes its one-shot model
 * call, repair is the fixer's ladder. `Hybrid` makes every step a mini agent — each helper call
 * becomes one bounded conversation that may look for what it misses, decides whether an existing
 * artifact must change at all, checks its own output and repairs it, and files what it learned.
 * Absent is `Hybrid`; a run finishes in the mode it started in.
 */
export enum WorkMode {
  Linear = 'linear',
  Hybrid = 'hybrid',
}
