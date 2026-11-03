import type { JSONSchemaType } from 'ajv'
import type { ModerationRewrite, ModerationScreen, ModerationVerdict } from './types.js'

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

/**
 * What the classifier answers when it screens several texts in one call: one item per text, keyed
 * by the number it was shown under. `category` stays a free string for the reason above; a
 * missing item reads as allowed.
 */
export const ModerationScreenSchema: JSONSchemaType<ModerationScreen> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          allowed: { type: 'boolean' },
          category: { type: 'string', maxLength: 64, nullable: true },
          evidence: { type: 'string', maxLength: 500, nullable: true },
        },
        required: ['index', 'allowed'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ModerationScreen>

/** What the classifier answers when it rewrites a refused text: the text, empty when it cannot. */
export const ModerationRewriteSchema: JSONSchemaType<ModerationRewrite> = {
  type: 'object',
  properties: {
    text: { type: 'string' },
  },
  required: ['text'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ModerationRewrite>
