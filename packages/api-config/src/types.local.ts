/**
 * A selected value, or the `OMIT` marker (`consts.local.ts`) for a value the selection drops.
 * `unknown` already admits the marker's `unique symbol` type, so the union is spelled out here only.
 */
export type SelectionResult = unknown
