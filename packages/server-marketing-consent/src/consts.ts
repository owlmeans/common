/**
 * The two resource aliases a Mongo/Postgres extension package (`@owlmeans/marketing-consent-mongo`,
 * `@owlmeans/marketing-consent-postgres` — later workstreams, not built yet) registers its concrete
 * resources under.
 *
 * These string values matter beyond this package: a target project's generated resource FILE names
 * are derived from an alias via a deterministic `resourceAlias()` helper elsewhere in the monorepo
 * (`entity/type` -> `entity-type`). Keep them exactly as declared here.
 */
export const RES_MARKETING_CONSENT_STATE = 'marketing-consent-state'
export const RES_MARKETING_CONSENT_LOG = 'marketing-consent-log'
