import type { OriginKind, OriginState } from './consts.js'

/*
 * The conversion declarations two or more owners share. Each owner's own types live in its
 * folder — `census/`, `detection/`, `taxonomy/`, `analysis/`, `origin/`, `estimate/`, `record/`,
 * `docs/` and `stage/` — and the barrel re-exports all of them.
 */

/**
 * A pointer into the ORIGIN sources backing a claim.
 *
 * Every derived statement carries one. It is what makes a restored specification checkable rather
 * than a plausible story about somebody else's code — and it is what a purge has to strip, since
 * after the origin is deleted a path into it points at nothing.
 */
export interface OriginProof {
  path: string
  symbol?: string
  /**
   * The first and last line of the fragment — two entries, and a LIST rather than a tuple.
   *
   * `JSONSchemaType` types a tuple only as the draft-04 `items: [schema, schema]` form, and that
   * form is not in the JSON-schema subset a provider's structured output accepts: OpenAI answers
   * the whole request `400 … is not of type 'object', 'boolean'`, and every schema that embeds a
   * proof — the purpose, each taxonomy layer, the access model, a story's proofs — fails with it.
   * The count is stated by `minItems`/`maxItems` instead, where a validator can enforce it and a
   * provider can read it.
   */
  lines?: number[]
  note: string
}

/**
 * Where a project's code came from, as the platform records it on the project.
 *
 * Written once at intake and never re-derived: a repository the user picked is an identity, and
 * recomposing it from a name would be a different repository the day somebody renames one.
 */
export interface ProjectOrigin {
  kind: OriginKind
  repoUrl?: string
  repoFullName?: string
  branch?: string
  state?: OriginState
  importedAt?: string
}
