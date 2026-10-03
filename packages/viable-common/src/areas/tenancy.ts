import type { Blueprint } from '../blueprint/types.js'
import { ProjectArea } from './consts.js'

/**
 * Whether a generated application splits its audiences into tenant ORGANIZATIONS.
 *
 * Two flags rather than one, because the two audiences split independently: one back office can
 * serve end users who each belong to their own company (`users` only), every reseller can run its
 * own staff over one shared public (`operators` only), and a B2B tool usually does both. An
 * organization is an IAM-managed tenant — never a table the target keeps for itself.
 *
 * Both false is today's application: one organization, the project owner's, that every person acts in.
 */
export interface ProjectTenancy {
  /** The staff of the back office are split into tenant organizations. */
  operators: boolean
  /** The end users of the front office are distributed across tenant organizations. */
  users: boolean
}

/**
 * A tenancy decision as the project card records it (`fields.tenancy`).
 *
 * The flags plus where they came from. `quotes` are the requester's OWN sentences, verbatim — the
 * evidence a later reader (a person reviewing the board, a run asked to reconsider) checks the
 * decision against, which a paraphrase would quietly replace with the model's reading of it.
 * `by` says whether a model inferred it or the owner set it; `at` is when, an ISO timestamp.
 */
export interface ViableTenancyDecision extends ProjectTenancy {
  quotes?: { operators?: string; users?: string }
  by: 'model' | 'owner'
  at: string
}

/** The longest requester sentence a tenancy decision quotes — a card refuses a longer one. */
export const TENANCY_QUOTE_MAX = 1024

/** A single-organization application — what every project is until a decision says otherwise. */
export const NO_TENANCY: ProjectTenancy = Object.freeze({ operators: false, users: false })

/**
 * The tenancy of a resolved blueprint.
 *
 * Total, like `landingGatePreferenceOf`: an absent layer, an absent key and a value this deploy
 * cannot read all answer {@link NO_TENANCY}. Only a literal `true` turns a flag on, because a flag
 * read as on by mistake splits a product's people into organizations nobody asked for, while one
 * read as off leaves the application exactly as it was before tenancy existed.
 */
export const tenancyOf = (blueprint?: Pick<Blueprint, 'experience'> | null): ProjectTenancy => {
  const tenancy = blueprint?.experience?.tenancy
  const operators = tenancy?.operators === true
  const users = tenancy?.users === true

  return operators || users ? Object.freeze({ operators, users }) : NO_TENANCY
}

/**
 * Whether an AREA's people act inside a tenant organization.
 *
 * Guest has no organization to act in, and admin is the project owner, who stands above every
 * tenant rather than inside one — so both are never tenanted, whatever the flags say.
 */
export const tenantedArea = (area: ProjectArea, tenancy: ProjectTenancy): boolean => {
  switch (area) {
    case ProjectArea.User: return tenancy.users === true
    case ProjectArea.Operator: return tenancy.operators === true
    default: return false
  }
}
