import type { JSONSchemaType } from 'ajv'
import type { ModerationVerdict } from './types.js'

/**
 * What the classifier must answer with.
 *
 * Kept minimal on purpose: a schema the model must satisfy is also a schema it will try to
 * fill, and every extra field is another thing it can hallucinate a reason into. The decision
 * is one boolean; the category exists so the browser can phrase the refusal; the evidence
 * exists so a human reviewing the trace can see what the model actually reacted to.
 *
 * `category` is a free string here even though only `ModerationCategory` values mean anything,
 * and that is deliberate. Constrained to the enum it made **every** call fail: with nothing to
 * categorise, a model that allows still fills the field — `"none"`, `""`, `"n/a"` — the
 * response fails validation, the retry budget runs out, and the gate fails open on every
 * request while looking like it is working. The value is narrowed in code instead
 * (`normalizeCategory`), where an unrecognized one is simply absent.
 */
export const ModerationVerdictSchema: JSONSchemaType<ModerationVerdict> = {
  type: 'object',
  properties: {
    allowed: { type: 'boolean' },
    category: { type: 'string', maxLength: 64, nullable: true },
    evidence: { type: 'string', maxLength: 500, nullable: true },
  },
  required: ['allowed'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ModerationVerdict>
