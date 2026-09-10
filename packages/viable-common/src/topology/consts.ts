import { TargetLayout } from '../integrity/consts.js'
import { SubProject } from '../slot/consts.js'
import type { TopologyDescriptor } from './types.js'

/**
 * The two arrangements the platform itself writes.
 *
 * They are the DEFAULTS a project falls back to, not the set of arrangements that can exist: a
 * project records its own topology and may hold packages neither of these names. What makes them
 * special is only that `detectTargetLayout` can recognise them from the disk, which is what a
 * consumer needs when a project predates the topology file entirely.
 *
 * v1 is frozen. A target's tree is the one it was initialized with, so nothing is ever added here.
 */
export const DEFAULT_TOPOLOGY: TopologyDescriptor = {
  id: 'owlmeans-fullstack',
  dir: 'sources',
  packages: [
    { name: 'common', roles: [SubProject.Common], kind: 'library', dependsOn: [] },
    // The shared LIBRARY, not the server — that is `api`. It owns the context factory, the config,
    // the resources, the services, the domain models and the job processors.
    { name: 'backend', roles: [SubProject.Backend], kind: 'library', dependsOn: ['common'] },
    { name: 'api', roles: [SubProject.Api], kind: 'bundle', dependsOn: ['common', 'backend'] },
    { name: 'web', roles: [SubProject.Web, SubProject.Frontend], kind: 'bundle', dependsOn: ['common'] },
    { name: 'worker', roles: [SubProject.Worker], kind: 'bundle', dependsOn: ['common', 'backend'] },
  ],
}

/**
 * The pre-restructure arrangement, frozen.
 *
 * `backend` here is the HTTP SERVER and `frontend` the browser app — the same two words the
 * current topology uses for other things, which is why roles are mapped per topology and never
 * joined onto a path.
 */
export const LEGACY_TOPOLOGY: TopologyDescriptor = {
  id: 'owlmeans-fullstack-v1',
  dir: 'packages',
  packages: [
    { name: 'common', roles: [SubProject.Common], kind: 'library', dependsOn: [] },
    { name: 'backend', roles: [SubProject.Backend, SubProject.Api], kind: 'bundle', dependsOn: ['common'] },
    { name: 'frontend', roles: [SubProject.Frontend, SubProject.Web], kind: 'bundle', dependsOn: ['common'] },
  ],
}

/** The default topology for each layout the platform can detect on disk. */
export const LAYOUT_TOPOLOGIES: Readonly<Record<TargetLayout, TopologyDescriptor>> = {
  [TargetLayout.V2]: DEFAULT_TOPOLOGY,
  [TargetLayout.V1]: LEGACY_TOPOLOGY,
}

/**
 * The frontmatter version of `.agents/memory/topology.md`.
 *
 * A file written by an older platform is READ, never refused: an unknown or missing version falls
 * back to the layout default, because a topology nobody can parse must not stop a project from
 * building.
 */
export const TOPOLOGY_VERSION = 1
