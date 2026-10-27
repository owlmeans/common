import type { BasicContext } from '@owlmeans/context'
import type { Resource } from '@owlmeans/resource'
import type {
  BotActivityRecord, BotConnectionRecord, BotResourceAliases, BotRuleRecord, BotService, BotUpdateRecord,
} from '../types.js'

/** The four stores under test. */
export interface BotConformanceResources {
  connection: Resource<BotConnectionRecord>
  rule: Resource<BotRuleRecord>
  update: Resource<BotUpdateRecord>
  activity: Resource<BotActivityRecord>
}

/**
 * What a store guarantees beyond the `Resource` contract. `unique`: the inbox's `dedupe` key is
 * unique in the store itself (a database index) — the service deduplicates without it, the store
 * is its backstop against two concurrent deliveries.
 */
export type BotConformanceCapability = 'unique'

/** What a case runs against: a bot service over the store's four resources. */
export interface BotConformanceSubject {
  service: BotService
  resources: BotConformanceResources
  capabilities: readonly BotConformanceCapability[]
}

export interface BotConformanceCase {
  name: string
  needs?: BotConformanceCapability[]
  run: (subject: BotConformanceSubject) => Promise<void>
}

export interface BotConformanceOptions {
  /** The service alias the subject registers, default `bot-conformance`. */
  alias?: string
  /** The resources' aliases, default `bot-connection` … */
  resources?: BotResourceAliases
  capabilities?: BotConformanceCapability[]
}

export interface BotConformanceSubjectMaker {
  /** A service over the resources already registered on `context`; build one per suite. */
  (context: BasicContext<any>, opts?: BotConformanceOptions): BotConformanceSubject
}
