/** The plugin's alias. Seated under it, so wiring it twice replaces rather than doubles. */
export const CUMULATIVE_RESULTS_PLUGIN = 'cumulative-results'

/** The answer shape a summary is asked for when its declaration names none. */
export const DEFAULT_RESULT_SUMMARY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
}
