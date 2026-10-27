import type { PackagePart } from './types.js'

/** The packages a call's messages talk about. */
export interface DetectedPackages {
  /** Every `@scope/name` the messages mention, in prose or code. */
  named: Set<string>
  /** The subset that appears as an import, export-from or require specifier. */
  imported: Set<string>
}

/** Whether a focus selects one part of a package, by purpose or by name. */
export interface PartSelector {
  (packageName: string, part: PackagePart): boolean
}
