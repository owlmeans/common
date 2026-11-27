import { TOPOLOGY_FILE } from '../../metadata/consts.js'
import { MAIN_APP } from '../../topology/apps/consts.js'
import { projectStructureHelper } from '../../topology/structure.js'
import {
  STRUCTURE_EDGE_RULES, STRUCTURE_LIBRARY_KINDS, STRUCTURE_STOCK_PARTS, StructurePartKind,
} from '../../topology/structure/consts.js'
import type { StructurePartKeys, StructureRef } from '../../topology/structure/types.js'
import { IntegrityRule, TARGET_PACKAGES_DIR, TargetPackage } from '../consts.js'
import { DEPENDENCY_FIELDS, WORKSPACE_PROTOCOL } from '../consts.local.js'
import type { IntegrityViolation } from '../types.js'
import type { AppPackage, PartLibrary, StructurePackages } from './types.local.js'
import type { StructureIntegrityHelper } from './structure/types.local.js'

export const createStructureIntegrityHelper = (): StructureIntegrityHelper => {
  const corePackages = new Set<string>(Object.values(TargetPackage))
  /** The core package whose rules a one-package bundled part is held to. */
  const BUNDLE_RULES: Partial<Record<StructurePartKind, AppPackage['rules']>> = {
    [StructurePartKind.Api]: TargetPackage.Api,
    [StructurePartKind.Web]: TargetPackage.Web,
    [StructurePartKind.Worker]: TargetPackage.Worker,
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  const isStock = (part: StructurePartKeys): boolean =>
    Object.hasOwn(STRUCTURE_STOCK_PARTS, part.name) && STRUCTURE_STOCK_PARTS[part.name] === part.kind

  /** Each part once, by name, in the record's order — a duplicate is `validateRef`'s to report. */
  const uniqueParts = (ref: StructureRef): StructurePartKeys[] => {
    const byName = new Map<string, StructurePartKeys>()
    for (const part of ref.parts) if (!byName.has(part.name)) byName.set(part.name, part)

    return [...byName.values()]
  }

  const read: StructureIntegrityHelper['read'] = data => {
    if (data.structure == null) return null
    const ref = projectStructureHelper.narrow(data.structure)
    if (ref == null || !isRecord(data.structure)) return { ref: null, dropped: 0 }
    const raw = data.structure as { areas: unknown[], parts: unknown[] }

    return { ref, dropped: raw.areas.length - ref.areas.length + raw.parts.length - ref.parts.length }
  }

  const packagesOf: StructureIntegrityHelper['packagesOf'] = ref => {
    const seen = new Set<string>(corePackages)
    const claim = (dir: string): boolean => {
      if (seen.has(dir)) return false
      seen.add(dir)

      return true
    }
    const bundles: AppPackage[] = []
    const libraries: PartLibrary[] = []
    for (const part of uniqueParts(ref)) {
      if (isStock(part)) continue
      const dirs = projectStructureHelper.packagesOf(part)
      if (STRUCTURE_LIBRARY_KINDS.includes(part.kind)) {
        for (const dir of dirs) if (claim(dir)) libraries.push({ dir, part: part.name })
        continue
      }
      // `packagesOf` answers a pair as [api, web]; every other bundled kind has one package.
      dirs.forEach((dir, at) => {
        const rules = part.kind === StructurePartKind.Pair ? (at === 0 ? TargetPackage.Api : TargetPackage.Web) : BUNDLE_RULES[part.kind]
        if (rules != null && claim(dir)) bundles.push({ dir, rules, owner: `the part "${part.name}"` })
      })
    }

    return { bundles, libraries } satisfies StructurePackages
  }

  const mapViolations: StructureIntegrityHelper['mapViolations'] = (record, context) => {
    const details: string[] = []
    const report = (detail: string): void => { if (!details.includes(detail)) details.push(detail) }

    if (context.dir !== TARGET_PACKAGES_DIR) report(`A project with a structure keeps its packages under ${TARGET_PACKAGES_DIR}/.`)
    const ref = record.ref
    if (ref == null) {
      report('The record\'s structure is not a structure — it needs an areas and a parts list.')
    } else {
      if (record.dropped === 1) report('1 entry of the record\'s structure is not an area or a part.')
      if (record.dropped > 1) report(`${record.dropped} entries of the record's structure are not areas or parts.`)
      const issues = projectStructureHelper.validateRef(ref)
      for (const issue of issues) report(issue.message)

      const named = new Set(context.packages.map(pkg => pkg.name))
      const parts = new Map(uniqueParts(ref).map(part => [part.name, part]))
      for (const part of parts.values()) {
        for (const dir of projectStructureHelper.packagesOf(part)) {
          if (!named.has(dir)) report(`The part "${part.name}"'s package "${dir}" is not among the record's packages.`)
        }
      }
      for (const pkg of context.packages) {
        if (pkg.part == null) continue
        const part = parts.get(pkg.part)
        if (part == null) {
          report(`The package "${pkg.name}" names the part "${pkg.part}", which the structure does not hold.`)
        } else if (!projectStructureHelper.packagesOf(part).includes(pkg.name)) {
          report(`The package "${pkg.name}" names the part "${pkg.part}", which does not own it.`)
        } else if (pkg.partKind != null && pkg.partKind !== part.kind) {
          report(`The package "${pkg.name}" names the part "${pkg.part}" a ${pkg.partKind} — the structure holds a ${part.kind}.`)
        }
      }

      // The runtime serves the record's apps; a structure whose pairs they are not is two answers
      // about one host. Compared only for a valid structure, whose pairs' map is well defined.
      if (issues.length === 0) {
        const extra = (apps: Array<{ name: string, mount: string, index: number, web: string, api: string }>): string =>
          JSON.stringify(apps.filter(app => app.name !== MAIN_APP)
            .map(app => [app.name, app.mount, app.index, app.web, app.api]).sort())
        if (extra(projectStructureHelper.appMapOf(ref).apps) !== extra(context.apps ?? [])) {
          report('The record\'s apps are not its structure\'s pairs.')
        }
      }
    }

    return details.map(detail => ({ path: TOPOLOGY_FILE, rule: IntegrityRule.StructureMap, detail }))
  }

  const dependencyViolations: StructureIntegrityHelper['dependencyViolations'] = (ref, context) => {
    const violations: IntegrityViolation[] = []
    const parts = new Map(uniqueParts(ref).map(part => [part.name, part]))
    const webKinds = STRUCTURE_EDGE_RULES[StructurePartKind.Web]
    for (const part of parts.values()) {
      const edges = projectStructureHelper.edgesOf(ref, part.name).packages
      const webEdges = edges.filter(dep => { const target = parts.get(dep); return target != null && webKinds.includes(target.kind) })
      projectStructureHelper.packagesOf(part).forEach((dir, at) => {
        const web = part.kind === StructurePartKind.Web || (part.kind === StructurePartKind.Pair && at === 1)
        const allowed = new Set((web ? webEdges : edges).map(dep => `${context.slug}-${dep}`))
        const manifest = context.manifestOf(dir)
        if (manifest == null) return
        const seen = new Set<string>()
        for (const field of DEPENDENCY_FIELDS) {
          const deps = manifest[field]
          if (!isRecord(deps)) continue
          for (const [name, version] of Object.entries(deps)) {
            if (typeof version !== 'string' || !version.startsWith(WORKSPACE_PROTOCOL) || allowed.has(name) || seen.has(name)) continue
            seen.add(name)
            violations.push({
              path: `${TARGET_PACKAGES_DIR}/${dir}/package.json`, rule: IntegrityRule.PartDependency,
              detail: `Package "${dir}" depends on ${name}, which the structure does not let the part "${part.name}" depend on.`,
            })
          }
        }
      })
    }

    return violations
  }

  return { read, packagesOf, mapViolations, dependencyViolations }
}

export const structureIntegrityHelper = createStructureIntegrityHelper()
