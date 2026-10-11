import { TARGET_CURRENT_LAYOUT, TargetLayout } from './consts.js'
import type { TargetLayoutManifest } from './types.js'
import { TARGET_LAYOUTS } from './layout/consts.js'
import type { TargetLayoutHelper } from './layout/types.js'

export const createTargetLayoutHelper = (): TargetLayoutHelper => {
  const targetManifest = (layout: TargetLayout): TargetLayoutManifest =>
    TARGET_LAYOUTS[layout]

  const isLegacyLayout = (layout: TargetLayout | string | undefined | null): boolean =>
    layout != null && layout !== TARGET_CURRENT_LAYOUT

  const detectTargetLayout = (files: Record<string, string | null>): TargetLayout => {
    for (const manifest of Object.values(TARGET_LAYOUTS)) {
      if (files[manifest.probe] != null) {
        return manifest.layout
      }
    }

    return TARGET_CURRENT_LAYOUT
  }

  const targetPackageName = (slug: string, pkg: string): string => `${slug}-${pkg}`

  const targetRequiredDeps = (
    slug: string, pkg: string, layout: TargetLayout = TARGET_CURRENT_LAYOUT
  ): string[] => {
    const manifest = targetManifest(layout)

    return [
      ...(manifest.requiredDeps[pkg] ?? []),
      ...(manifest.workspaceDeps[pkg] ?? []).map(dep => targetPackageName(slug, dep)),
    ]
  }

  return { targetManifest, isLegacyLayout, detectTargetLayout, targetPackageName, targetRequiredDeps }
}

export const targetLayoutHelper = createTargetLayoutHelper()
