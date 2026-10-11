import type { ProjectArea } from '../../areas/consts.js'
import type { ArchitectureCase, TaxonomyKind } from '../consts.js'
import type { OriginProof } from '../types.js'

/** What the origin says about itself in prose — the cheapest and best evidence there is. */
export interface HarnessDigest {
  readme?: string
  agents?: string
  docs: { path: string, title: string, chars: number }[]
  openapi: string[]
  migrations: string[]
  env: string[]
  scripts: Record<string, string>
  summary: string
}

export interface TaxonomyEntry {
  name: string
  path: string
  kind: TaxonomyKind
  symbol?: string
  entity?: string
  refs?: string[]
  note?: string
  proofs?: OriginProof[]
}

export interface TaxonomyPackage {
  name: string
  path: string
  /** What this package does in the origin's own terms — `api`, `web`, `worker`, `db`, … */
  role: string
  entries: Partial<Record<TaxonomyKind, TaxonomyEntry[]>>
}

/** A role the origin's own access model names, mapped onto the area whose audience holds it. */
export interface TaxonomyRole {
  name: string
  area: ProjectArea
  evidence: OriginProof[]
}

export interface TaxonomyPermission {
  name: string
  roles: string[]
  /** The origin's own guards, middlewares or decorators that enforce it. */
  guards: string[]
  evidence: OriginProof[]
}

export interface TaxonomySummary {
  case: ArchitectureCase
  packages: TaxonomyPackage[]
  areas: ProjectArea[]
  roles: TaxonomyRole[]
  permissions: TaxonomyPermission[]
  counts: Record<TaxonomyKind, number>
  /** Where the origin does something its own stack's conventions do not explain. */
  deviations: string[]
  /** What a whole taxonomy would have needed and the origin does not carry. */
  missingHarness: string[]
  version: number
}

/** What one taxonomy layer's model call answers with. */
export interface TaxonomyEntryList {
  entries: TaxonomyEntry[]
}

/** What the access-model pass answers with — the roles and the permissions in one call. */
export interface TaxonomyRoleList {
  roles: TaxonomyRole[]
  permissions: TaxonomyPermission[]
}
