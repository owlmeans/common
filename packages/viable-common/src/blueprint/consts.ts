/**
 * The blueprint the platform ships and every project uses until something says otherwise.
 *
 * A string rather than an enum: a blueprint may be registered by a consumer, and an enum would
 * make the platform's own list the closed set of everything that can exist — which is the shape
 * this whole abstraction was introduced to remove.
 */
export const DEFAULT_BLUEPRINT_ID = 'owlmeans-fullstack-ts'

/** Recorded on a project so a later run knows which blueprint drew it. */
export const BLUEPRINT_META_KEY = 'blueprint'
