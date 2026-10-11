import type { TargetLayout } from './consts.js'
import { targetLayoutHelper } from './layout.js'
import type { TargetLayoutManifest } from './types.js'

/** @deprecated compat:factory-refactor — use `targetLayoutHelper.targetManifest(…)` */
export const targetManifest = (layout: TargetLayout): TargetLayoutManifest => targetLayoutHelper.targetManifest(layout)

/** @deprecated compat:factory-refactor — use `targetLayoutHelper.isLegacyLayout(…)` */
export const isLegacyLayout = (layout: TargetLayout | string | undefined | null): boolean =>
  targetLayoutHelper.isLegacyLayout(layout)

/** @deprecated compat:factory-refactor — use `targetLayoutHelper.detectTargetLayout(…)` */
export const detectTargetLayout = (files: Record<string, string | null>): TargetLayout =>
  targetLayoutHelper.detectTargetLayout(files)

/** @deprecated compat:factory-refactor — use `targetLayoutHelper.targetPackageName(…)` */
export const targetPackageName = (slug: string, pkg: string): string => targetLayoutHelper.targetPackageName(slug, pkg)

/** @deprecated compat:factory-refactor — use `targetLayoutHelper.targetRequiredDeps(…)` */
export const targetRequiredDeps = (slug: string, pkg: string, layout?: TargetLayout): string[] =>
  targetLayoutHelper.targetRequiredDeps(slug, pkg, layout)
