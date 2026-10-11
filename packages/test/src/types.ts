export interface EnvOk {
  ok: true
}

export interface EnvSkip {
  skip: true
  reason: string
}

// Kept as a type: a union of the two gate outcomes.
export type EnvGate = EnvOk | EnvSkip

// Kept as a type: a record over arbitrary gate names (an implicit index signature).
export type GateSpec = Record<string, string[]>

// Kept as a type: mapped over the spec's gate names.
export type Gates<S extends GateSpec> = { readonly [K in keyof S]: EnvGate }

export interface LoadEnvOptions {
  /** Re-read the file even when it was already loaded once in this process. */
  force?: boolean
  /** The file to read instead of `<monorepo-root>/.env`. */
  file?: string
}

/** The test environment: `<monorepo-root>/.env` merged into `process.env`, and gates over it. */
export interface EnvHelper {
  /**
   * Locate `<monorepo-root>/.env`, parse it and merge it into `process.env` — a variable that is
   * already set and non-empty wins. Idempotent per process unless `force` is passed.
   */
  loadEnv: (opts?: LoadEnvOptions) => void
  /** Whether a variable is set to a non-empty value (after {@link EnvHelper.loadEnv}). */
  hasEnv: (key: string) => boolean
  /** `{ ok: true }` when every key is set, otherwise `{ skip: true, reason }` naming the missing ones. */
  requireEnv: (keys: string[]) => EnvGate
}
