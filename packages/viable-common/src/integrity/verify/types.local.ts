import type { AppDescriptor } from '../../topology/apps/types.js'
import type { StructureRef } from '../../topology/structure/types.js'
import type { TargetPackageDescriptor, TargetPackageKind } from '../../topology/types.js'
import type { TargetPackage } from '../consts.js'

/**
 * A topology record that splits the tree into apps, as the manifest reads it.
 *
 * `apps` is the STRUCTURALLY narrowed list — the rules between entries are checked by the verifier
 * itself and refuse the tree (`app-map`) rather than quietly falling back to `main` the way a
 * runtime reader does.
 */
export interface AppsRecord {
  /** How many entries the record's `apps` list held, narrowable or not. */
  claimed: number
  apps: AppDescriptor[]
  /** The package directory names the record's `packages` list names. */
  packages: Set<string>
  dir: string
}

/**
 * One bundled package the manifest checks under a core package's rules — an extra app's web or api,
 * a structure part's api, web or worker — with the core package whose rules it inherits.
 */
export interface AppPackage {
  dir: string
  rules: TargetPackage.Web | TargetPackage.Api | TargetPackage.Worker
  /** What it belongs to, as a reader names it: `the app "admin"`, `the part "reports"`. */
  owner: string
}

/** A structure part's library package — a library or shared library beyond the stock ones. */
export interface PartLibrary {
  dir: string
  part: string
}

/**
 * A recorded package that is neither one of the five core packages nor an extra app's nor a
 * structure part's — an adopted or pulled one — with the kind the runtime's build lists read it as.
 */
export interface OtherPackage {
  dir: string
  kind: TargetPackageKind
}

/** A record's `structure` block, as the manifest reads it. */
export interface StructureRecord {
  /** The block narrowed STRUCTURALLY — `null` when it is not shaped like a structure at all. */
  ref: StructureRef | null
  /** How many entries of its `areas` and `parts` lists did not narrow. */
  dropped: number
}

/** The packages of a structure's parts beyond the stock ones, by the rules they are held to. */
export interface StructurePackages {
  bundles: AppPackage[]
  libraries: PartLibrary[]
}

/**
 * What a V2 tree's topology record makes of it when the tree is verified against the record: split
 * into apps, carrying a structure, naming packages beyond the five core ones, or any of them.
 */
export interface TreeRecord {
  /** The record's packages directory, as written. */
  dir: string
  /** The record's packages as the topology reader narrows them — their part tags included. */
  recorded: TargetPackageDescriptor[]
  /** The split, when the record names two or more apps. */
  split: AppsRecord | null
  /** The structure block, when the record carries one. */
  structure: StructureRecord | null
  /**
   * The record holds the workspace to itself (`workspace-package`): a split or a structure. Any
   * other record treats a package it does not name as an unclassified bundle.
   */
  strict: boolean
  /** The extra apps' packages and the structure's api, web and worker parts' (empty without either). */
  appPackages: AppPackage[]
  /** The structure's library parts' packages (empty without a structure). */
  partLibraries: PartLibrary[]
  /** Every package directory the record's `packages` list names. */
  packages: Set<string>
  /** The recorded packages outside the core, app and part ones, in the runtime's build order. */
  others: OtherPackage[]
}
