import type { AppDescriptor } from '../../../topology/apps/types.js'
import type { StructureRef } from '../../../topology/structure/types.js'
import type { TargetPackageDescriptor } from '../../../topology/types.js'
import type { IntegrityViolation } from '../../types.js'
import type { StructurePackages, StructureRecord } from '../types.local.js'

/** What `structure-map` checks the block against besides itself: the rest of the record. */
export interface StructureMapContext {
  /** The record's packages directory. */
  dir: string
  /** The record's packages as the topology reader narrowed them — their part tags included. */
  packages: TargetPackageDescriptor[]
  /** The record's apps, structurally narrowed — `null` when it does not split. */
  apps: AppDescriptor[] | null
}

/** What `part-dependency` reads a part package's manifest through. */
export interface PartDependencyContext {
  /** The project slug, read off the root — every sibling is `<slug>-<package>`. */
  slug: string
  /** A package's manifest by directory; `null` when it is absent or unreadable (reported elsewhere). */
  manifestOf: (dir: string) => Record<string, unknown> | null
}

/**
 * The integrity manifest's reading of a topology record's STRUCTURE — what the platform stages a
 * project of parts from (`projectStructureHelper.topologyOf`). Pure; the verifier collects what it
 * answers into its report.
 */
export interface StructureIntegrityHelper {
  /** The record's `structure` block, narrowed — `null` when the record carries none. */
  read: (data: Record<string, unknown>) => StructureRecord | null
  /**
   * The packages of the parts beyond the stock ones (`common`, `backend`, `main`, `worker` are the
   * core packages): every api, web and worker part's under the core api, web or worker rules, every
   * library and shared library part's under the library rules. Each package once, core names never.
   */
  packagesOf: (ref: StructureRef) => StructurePackages
  /**
   * `structure-map`: the block is not a structure, lost entries, fails `validateRef` (illegal edges,
   * cycles, duplicate indices and mounts, …), keeps its packages outside `sources/`, names a part whose
   * packages the record does not, tags a package with a part that does not own it, or holds pairs the
   * record's apps do not.
   */
  mapViolations: (record: StructureRecord, context: StructureMapContext) => IntegrityViolation[]
  /**
   * `part-dependency`: each part package's `workspace:` siblings beyond what the part's edges allow
   * (`projectStructureHelper.edgesOf`; a web side only its common and library edges).
   */
  dependencyViolations: (ref: StructureRef, context: PartDependencyContext) => IntegrityViolation[]
}
