export { discover } from './discover.js'
export type { DiscoveredEntry, Manifest, ManifestEntry, DiscoverOptions } from './types.js'

export { detectLinked } from './linked.js'
export type { LinkedResult } from './types.js'

export { planInstall } from './plan.js'
export { AUTO_GENERATED_BANNER } from './consts.js'
export type { InstallAction, InstallItem, PlanOptions } from './types.js'

export { applyInstall } from './apply.js'
export type { ApplyResult } from './types.js'

export { run } from './run.js'
export type { RunResult } from './types.js'
