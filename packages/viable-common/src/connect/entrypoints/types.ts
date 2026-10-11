import type { ConnectPaidGate } from '../consts.js'

/** One gate a deployment injects: the gate service's alias and the parameters it asserts. */
export interface ConnectGateRef {
  alias: string
  params: string[]
}

/**
 * What the platform injects when it mounts the connector routes.
 *
 * The names of the guard and the gates belong to the deployment, not to the contract: a connector
 * API on another platform would guard the same paths with its own vocabulary. Everything else —
 * paths, methods, schemas, parents — is fixed here so a client cannot address them differently.
 */
export interface ConnectEntrypointOptions {
  /** The guard alias every connector route carries. */
  guard: string
  /** The gate alias and parameters that decide project ownership. */
  gate?: ConnectGateRef
  /**
   * The gate of the organization's own records — the account base (`/connect/account`), a root of
   * its own beside `base` rather than a child of it, so the two ownership gates never share a
   * service in one resolved list.
   */
  accountGate?: ConnectGateRef
  /**
   * The payment gates, by the kind of thing a route spends. A route declares its kind; the
   * deployment names the gate service and its parameters. A kind left out leaves its routes
   * ungated by payment — the deployment's choice, never the connector's.
   */
  paid?: Partial<Record<ConnectPaidGate, ConnectGateRef>>
  /**
   * @deprecated compat:connect-paid-map — `paid[ConnectPaidGate.LocalLlm]`. Read only when the map
   * names no local-LLM gate.
   */
  localLlm?: ConnectGateRef
  /** Path prefix; defaults to `/connect`. */
  path?: string
}
