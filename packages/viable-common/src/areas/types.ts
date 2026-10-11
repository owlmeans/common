import type { ProjectArea } from './consts.js'

/**
 * A user story as the analysis stage produces it: the narrative, plus the area whose
 * audience acts in it.
 *
 * The area is structured data rather than a phrase inside the sentence because everything
 * downstream keys off it — which entrypoint the story's screens hang under, what access they
 * inherit, and which URL the preview opens when the story is done.
 */
export interface StoryDraft {
  story: string
  area: ProjectArea
}

/**
 * One line of the generated application's navigation.
 *
 * A screen reaches the menus through exactly one of these. `section` groups entries into the
 * top menu; it is a label, never a URL segment — the address of a screen is its entrypoint
 * path and nothing else.
 */
export interface NavEntry {
  area: ProjectArea
  section: string
  /** The screen's `app.web.*` alias. */
  alias: string
  label: string
}

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
