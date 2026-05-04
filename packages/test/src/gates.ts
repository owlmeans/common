import { requireEnv } from './env.js'
import type { EnvGate } from './env.js'

export type GateSpec = Record<string, string[]>

export type Gates<S extends GateSpec> = { readonly [K in keyof S]: EnvGate }

/**
 * Build a frozen record of gates from a spec of `{ name: [envKey, ...] }`.
 * Use in `tests/context.ts` so a single source of truth describes which
 * external dependencies are available, and individual specs read
 * `gates.<name>.skip` to self-skip when their dependency is missing.
 */
export const makeGates = <S extends GateSpec>(spec: S): Gates<S> => {
  const out = {} as Record<string, EnvGate>
  for (const [name, keys] of Object.entries(spec)) {
    out[name] = requireEnv(keys)
  }
  return Object.freeze(out) as Gates<S>
}

export const isSkip = (gate: EnvGate): gate is { skip: true, reason: string } =>
  (gate as { skip?: true }).skip === true
