import type { ProjectTenancy } from '../../areas/types.js'

/**
 * What a person chose BEFORE the specification — on the home screen, the structure step or the import
 * dialog: the blueprint, the case and its category, a bot's platforms and the tenancy flags.
 *
 * The keys are the REGISTRY's words, the same ones `describe_blueprints` answers (`StackCatalogue`):
 * `blueprint` is a STACK, `case` the kind of product, `category` its kind of work, game kind or bot kit.
 * A person and a connector tool read them one step down — the tool's `blueprint` argument is this
 * `case`, its `case` argument this `category`, and the stack is neither shown nor chosen while the
 * registry holds one (viable-sdk `structureToolHelper`). The wire keeps these names.
 *
 * Every key is optional, and an absent key is "Auto": the platform classifies it. Plain strings where
 * the vocabulary grows in a library this contract does not redeploy with (blueprint, case, category —
 * a game kind, a work kind or a bot kit, as the catalogue's `SupportedBlueprint.categoryKind`
 * says), settled against the deployed registry by the agent.
 */
export interface CatalogueChoice {
  /** A blueprint id of the catalogue (`StackCatalogue.blueprints[].id`). */
  stack?: string
  /** A case id of that blueprint (`SupportedBlueprint.id`). */
  blueprint?: string
  /** A category id of that case (`SupportedCase.id`). */
  case?: string
  /** A bot case's platform ids (`SupportedBlueprint.botPlatforms`). */
  botPlatforms?: string[]
  /** Both tenancy flags, or absent for the classifier's. */
  tenancy?: ProjectTenancy
}
