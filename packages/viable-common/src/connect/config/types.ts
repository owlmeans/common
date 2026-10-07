import type { WorkloadKind } from '../../slot/consts.js'

/**
 * Which workload's set a configuration read or write addresses: the project's preview (the
 * default) or its production workload, whose rows are its own and reach it only at a Publish.
 */
export type ConnectConfigScope = WorkloadKind.Ephemeral | WorkloadKind.Production

/** `?scope=` — absent is the preview's set. */
export interface ConnectScopeQuery {
  scope?: ConnectConfigScope
}

/** One backend variable as a connector reads it: its name and whether it holds a value — never the value. */
export interface ConnectConfigVariable {
  name: string
  /** A non-empty value is stored. The value itself is a secret and is never returned. */
  set: boolean
}

/** One frontend variable: public by nature — it is baked into the bundle every visitor downloads. */
export interface ConnectFrontendVariable extends ConnectConfigVariable {
  /** `''` when unset. */
  value: string
}

/**
 * A project's configuration requirements: the variables its generated application declares, per
 * side, for one scope. A backend variable's value is never part of it.
 */
export interface ConnectProjectConfig {
  scope: ConnectConfigScope
  backend: ConnectConfigVariable[]
  frontend: ConnectFrontendVariable[]
}

/** One variable a save sets. A new name is declared on its side; an existing one keeps its side. */
export interface ConnectConfigValue {
  name: string
  value: string
}

/**
 * A PATCH of a project's configuration: the variables named are set, every other one keeps its
 * value. A name already declared on the OTHER side is refused — a backend secret written as a
 * frontend variable would be published in the bundle.
 */
export interface ConnectConfigSaveBody {
  backend?: ConnectConfigValue[]
  frontend?: ConnectConfigValue[]
}
