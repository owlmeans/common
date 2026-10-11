import { TargetLayout } from '../integrity/index.js'
import { topologyHelper } from '../topology/resolve.js'
import { SubProject } from './consts.js'
import type { TargetPaths } from './types.js'
import type { SlotLayoutHelper } from './layout/types.js'

/**
 * Where every role lives, per layout — DERIVED from that layout's topology.
 *
 * These were two hand-written records, and the pair could disagree with each other and with the
 * tree: `build` listed the packages in an order somebody maintained by hand beside the graph that
 * actually decides it, and `libraries` was a second copy of "which of these are built with
 * `tsc -b`". Both are now read off {@link LAYOUT_TOPOLOGIES}, so a package added to a topology
 * appears in the build order, in the library order and in the role map at once, or in none of them.
 *
 * The VALUES are unchanged, and `topology.spec.ts` pins them against the tables they replaced.
 */
const pathsOfTopology = (layout: TargetLayout): TargetPaths => {
  const topology = topologyHelper.resolveTopology(topologyHelper.topologyOf(layout))
  const dirOf = (role: SubProject): string | undefined => topologyHelper.packageForRole(topology, role)?.name

  return {
    layout,
    dir: topology.dir,
    // The three roles every arrangement has. A topology without one is not a target, so the
    // fallback is the role's own name rather than a silent `undefined` reaching a path join.
    api: dirOf(SubProject.Api) ?? SubProject.Api,
    web: dirOf(SubProject.Web) ?? SubProject.Web,
    common: dirOf(SubProject.Common) ?? SubProject.Common,
    // A NAME, not a promise — every caller checks the disk before acting on it.
    ...(dirOf(SubProject.Worker) != null ? { worker: dirOf(SubProject.Worker) } : {}),
    build: topology.build,
    libraries: topology.libraries,
  }
}

export const LAYOUTS: Record<TargetLayout, TargetPaths> = {
  [TargetLayout.V1]: pathsOfTopology(TargetLayout.V1),
  [TargetLayout.V2]: pathsOfTopology(TargetLayout.V2),
}

/**
 * Role → directory, per layout. Total over {@link SubProject} in both layouts, deliberately.
 *
 * The v2 role names have v1 equivalents (`api` is v1's `backend`, `web` its `frontend`) and are
 * mapped to them, so a current sender talking to an old tree still reaches the right package. The
 * one role with no v1 equivalent is `worker`, and it maps to a directory that does not exist there
 * rather than to a plausible one: a command aimed at a package this tree does not have must fail
 * where it is issued. Answering `common` instead — which is what the missing entries used to do —
 * runs it somewhere real and wrong.
 *
 * Totality is what a topology cannot give on its own (it maps only the roles its packages hold),
 * so an unmapped role falls back to its own name here, which is that same visible failure.
 */
const roleDirsOfTopology = (layout: TargetLayout): Record<SubProject, string> => {
  const topology = topologyHelper.resolveTopology(topologyHelper.topologyOf(layout))

  return Object.values(SubProject).reduce<Record<SubProject, string>>((dirs, role) => {
    dirs[role] = topologyHelper.packageForRole(topology, role)?.name ?? role

    return dirs
  }, {} as Record<SubProject, string>)
}

export const ROLE_DIRS: Record<TargetLayout, Record<SubProject, string>> = {
  [TargetLayout.V1]: roleDirsOfTopology(TargetLayout.V1),
  [TargetLayout.V2]: roleDirsOfTopology(TargetLayout.V2),
}

export const createSlotLayoutHelper = (): SlotLayoutHelper => {
  const subprojectDirOf = (layout: TargetLayout, role: SubProject): string =>
    ROLE_DIRS[layout][role] ?? role

  const pathsOf = (layout: TargetLayout): TargetPaths => LAYOUTS[layout]

  return { subprojectDirOf, pathsOf }
}

export const slotLayoutHelper = createSlotLayoutHelper()

/** @deprecated compat:factory-refactor — use `slotLayoutHelper.subprojectDirOf(…)` */
export const subprojectDirOf = (layout: TargetLayout, role: SubProject): string =>
  slotLayoutHelper.subprojectDirOf(layout, role)
