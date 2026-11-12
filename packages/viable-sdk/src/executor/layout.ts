import fs from 'node:fs'
import path from 'node:path'

import {
  LAYOUTS, MAIN_APP, TOPOLOGY_FILE, TargetLayout, appMapHelper, slotLayoutHelper, topologyCardHelper,
} from '@owlmeans/viable-common'
import type { AppDescriptor, SubProject, TargetPaths } from '@owlmeans/viable-common'

import { LAYOUT_MARKER_PATHS } from './consts.local.js'
import type { LayoutHelper } from './layout/types.js'

/**
 * Where a target project's packages live, in THIS directory.
 *
 * The tables — which role is which directory, what a full build runs, which packages must be
 * built before anything imports them — belong to `@owlmeans/viable-common`, because the publisher
 * answers the same questions over a pod volume. What lives here is the pair of filesystem probes
 * that pick a layout and turn a package name into an absolute path.
 *
 * Platform vs target: this describes a TARGET project's directory shape. Nothing about the SDK's
 * own repository is v1 or v2.
 */
export const makeLayoutHelper = (dir: string): LayoutHelper => {
  const detectLayout = (): TargetLayout => {
    for (const [layout, marker] of LAYOUT_MARKER_PATHS) {
      if (fs.existsSync(path.join(dir, marker))) {
        return layout
      }
    }

    return TargetLayout.V1
  }

  const targetPaths = (): TargetPaths => LAYOUTS[detectLayout()]

  const apps = (): AppDescriptor[] => {
    // Only a current-layout tree is ever split; a v1 tree, a missing or unreadable record and a map
    // that breaks a rule all read as the one app every project has.
    if (detectLayout() !== TargetLayout.V2) return appMapHelper.fromTopology(null)
    let source: string | null = null
    try {
      source = fs.readFileSync(path.join(dir, TOPOLOGY_FILE), 'utf-8')
    } catch {
      source = null
    }

    return appMapHelper.fromTopology(source == null ? null : topologyCardHelper.parseTopologyFile(source))
  }

  /** The package directory of one side of a non-main app: its record's, else the naming rule's. */
  const appDir = (app: string, side: 'web' | 'api'): string => {
    const found = apps().find(candidate => candidate.name === app)

    return path.resolve(dir, targetPaths().dir, found?.[side] ?? `${app}-${side}`)
  }

  const isMain = (app?: string): boolean => app == null || app === '' || app === MAIN_APP

  const apiPath = (app?: string): string => {
    if (!isMain(app)) return appDir(app!, 'api')
    const paths = targetPaths()

    return path.resolve(dir, paths.dir, paths.api)
  }

  const webPath = (app?: string): string => {
    if (!isMain(app)) return appDir(app!, 'web')
    const paths = targetPaths()

    return path.resolve(dir, paths.dir, paths.web)
  }

  const workerPath = (): string | null => {
    const paths = targetPaths()

    return paths.worker == null ? null : path.resolve(dir, paths.dir, paths.worker)
  }

  const hasWorker = (): boolean => {
    const worker = workerPath()

    return worker != null && fs.existsSync(path.join(worker, 'package.json'))
  }

  const subprojectDir = (role: SubProject): string =>
    slotLayoutHelper.subprojectDirOf(detectLayout(), role)

  const libraryPaths = (): string[] => {
    const paths = targetPaths()

    return paths.libraries
      .map(pkg => path.resolve(dir, paths.dir, pkg))
      .filter(library => fs.existsSync(library))
  }

  return { detectLayout, targetPaths, apps, apiPath, webPath, workerPath, hasWorker, subprojectDir, libraryPaths }
}
