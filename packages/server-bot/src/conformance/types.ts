import type { BasicContext } from '@owlmeans/context'
import type { Resource } from '@owlmeans/resource'
import type { BotPlatformPlugin } from '../platforms/types.js'
import type {
  BotActivityRecord, BotConnectionRecord, BotResourceAliases, BotService, BotUpdateRecord,
} from '../types.js'

/** The three stores under test. */
export interface BotConformanceResources {
  connection: Resource<BotConnectionRecord>
  update: Resource<BotUpdateRecord>
  activity: Resource<BotActivityRecord>
}

/**
 * What a store guarantees beyond the `Resource` contract. `unique`: the inbox's `dedupe` key is
 * unique in the store itself (a database index) — the service deduplicates without it, the store
 * is its backstop against two concurrent deliveries.
 */
export type BotConformanceCapability = 'unique'

/** What a case runs against: a bot service over the store's three resources, with one platform plugin. */
export interface BotConformanceSubject {
  service: BotService
  resources: BotConformanceResources
  capabilities: readonly BotConformanceCapability[]
  /**
   * The plugin the service is given — its connections are mock ones, verified without a public
   * origin (so they poll), and its mock signs the deliveries a case posts.
   */
  platform: BotPlatformPlugin
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
  /**
   * The platform plugin the cases connect on; default `makeTestBotPlatform()` (`./mock`). It must
   * accept a mock connection without credentials, poll without a public origin and answer `verify`
   * with a `mock_`-prefixed username.
   */
  platform?: BotPlatformPlugin
}

export interface BotConformanceSubjectMaker {
  /** A service over the resources already registered on `context`; build one per suite. */
  (context: BasicContext<any>, opts?: BotConformanceOptions): BotConformanceSubject
}
