import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

import { LAYOUT_MARKERS, TOPOLOGY_FILE, TargetLayout } from '@owlmeans/viable-common'

/**
 * A TARGET project split into three apps — main at the root, admin under `/admin`, backoffice under
 * `/backoffice` — as the platform's topology writer records it (`.agents/memory/topology.md`).
 * Platform vs target: the trees built here are test data, not this repository.
 */
const pkg = (name: string, roles: string[], deps: string[], app?: string): string => [
  `  - name: ${name}`, '    roles:', ...roles.map(role => `      - ${role}`), `    kind: ${roles.includes('common') || roles.includes('backend') ? 'library' : 'bundle'}`,
  deps.length > 0 ? '    dependsOn:' : '    dependsOn: []', ...deps.map(dep => `      - ${dep}`),
  ...(app != null ? [`    app: ${app}`, `    mount: ${app}`] : []),
].join('\n')

const app = (name: string, mount: string, areas: string[], web: string, api: string, index: number): string => [
  `  - name: ${name}`, `    mount: "${mount}"`, '    areas:', ...areas.map(area => `      - ${area}`),
  `    web: ${web}`, `    api: ${api}`, `    index: ${index}`,
].join('\n')

export const SPLIT_TOPOLOGY_FILE = [
  '---', 'id: owlmeans-fullstack', 'dir: sources', 'packages:',
  pkg('common', ['common'], []), pkg('backend', ['backend'], ['common']), pkg('api', ['api'], ['common', 'backend']),
  pkg('web', ['web', 'frontend'], ['common']), pkg('worker', ['worker'], ['common', 'backend']),
  pkg('admin-api', ['api'], ['common', 'backend'], 'admin'), pkg('admin-web', ['web', 'frontend'], ['common'], 'admin'),
  pkg('backoffice-api', ['api'], ['common', 'backend'], 'backoffice'),
  pkg('backoffice-web', ['web', 'frontend'], ['common'], 'backoffice'),
  'areas:',
  '  - key: guest\n    kind: guest\n    segment: ""', '  - key: user\n    kind: user\n    segment: frontoffice',
  '  - key: admin\n    kind: admin\n    segment: admin', '  - key: operator\n    kind: operator\n    segment: backoffice',
  'apps:',
  app('main', '', ['guest', 'user'], 'web', 'api', 0), app('admin', 'admin', ['admin'], 'admin-web', 'admin-api', 1),
  app('backoffice', 'backoffice', ['operator'], 'backoffice-web', 'backoffice-api', 2),
  'version: 1', 'updatedAt: 2026-11-11T10:00:00.000Z', '---', '', '# Topology', '',
].join('\n')

/** A temporary v2 tree; `split` writes the topology record above, `dirs` the extra package directories. */
export const makeTargetTree = async (opts: { split?: boolean, topology?: string, dirs?: string[] } = {}): Promise<string> => {
  const root = await fse.mkdtemp(path.join(os.tmpdir(), 'viable-sdk-apps-'))
  await fse.ensureDir(path.join(root, LAYOUT_MARKERS.find(([kind]) => kind === TargetLayout.V2)![1]))
  for (const dir of ['sources/common', 'sources/backend', 'sources/api', 'sources/web', ...(opts.dirs ?? [])]) {
    await fse.ensureDir(path.join(root, dir))
  }
  const topology = opts.topology ?? (opts.split === true ? SPLIT_TOPOLOGY_FILE : null)
  if (topology != null) await fse.outputFile(path.join(root, TOPOLOGY_FILE), topology)

  return root
}
