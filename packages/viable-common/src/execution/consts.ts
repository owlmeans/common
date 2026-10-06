
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
}
