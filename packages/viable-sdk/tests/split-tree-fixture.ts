import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { TOPOLOGY_FILE, TargetLayout, TargetPackage, targetLayoutHelper, type TargetFileMap } from '@owlmeans/viable-common'
import { SPLIT_TOPOLOGY_FILE } from './apps-fixture.js'

/**
 * TARGET trees that pass the integrity gate — one app, or split into main + admin + backoffice as
 * `SPLIT_TOPOLOGY_FILE` records it — materialized into temporary directories. Test data, not this
 * repository.
 */
export interface SplitTreeFixture {
  /** A package's manifest: main's `rules` package (its build script and required deps) named `dir`. */
  manifestOf: (dir: string, rules: string) => string
  /** One package's manifest files and markers — main's `rules` package re-rooted at `dir`. */
  packageFiles: (dir: string, rules: string) => TargetFileMap
  oneAppTree: () => TargetFileMap
  splitTree: () => TargetFileMap
  /** Writes the files into a new temporary directory; `cleanup` removes every one it made. */
  materialize: (files: TargetFileMap) => Promise<string>
  cleanup: () => Promise<void>
}

export const SPLIT_EXTRA_APPS = ['admin', 'backoffice']

export const makeSplitTreeFixture = (slug: string, prefix = 'viable-sdk-tree-'): SplitTreeFixture => {
  const manifest = targetLayoutHelper.targetManifest(TargetLayout.V2)
  const roots: string[] = []

  const manifestOf: SplitTreeFixture['manifestOf'] = (dir, rules) => JSON.stringify({
    name: targetLayoutHelper.targetPackageName(slug, dir), type: 'module',
    scripts: { build: manifest.buildScripts[rules] },
    dependencies: Object.fromEntries(targetLayoutHelper.targetRequiredDeps(slug, rules, TargetLayout.V2).map(dep => [dep, '1.0.0'])),
  })

  const packageFiles: SplitTreeFixture['packageFiles'] = (dir, rules) => {
    const root = `${manifest.dir}/${rules}/`
    const files: TargetFileMap = {}
    for (const file of manifest.files.filter(file => file.startsWith(root))) {
      const rel = file.slice(root.length)
      const target = `${manifest.dir}/${dir}/${rel}`
      files[target] = rel === 'package.json' ? manifestOf(dir, rules)
        : file.endsWith('.json') ? '{}' : (manifest.markers[file] ?? ['export {}']).join('\n')
    }

    return files
  }

  const oneAppTree: SplitTreeFixture['oneAppTree'] = () => {
    const files: TargetFileMap = {
      'package.json': JSON.stringify({ name: slug, type: 'module', workspaces: [manifest.workspaceGlob] }),
      'bunfig.toml': '[install]\nlinker = "hoisted"\n',
    }
    for (const pkg of manifest.packages) Object.assign(files, packageFiles(pkg, pkg))

    return files
  }

  const splitTree: SplitTreeFixture['splitTree'] = () => {
    const files = oneAppTree()
    files[TOPOLOGY_FILE] = SPLIT_TOPOLOGY_FILE
    for (const app of SPLIT_EXTRA_APPS) {
      Object.assign(files, packageFiles(`${app}-web`, TargetPackage.Web), packageFiles(`${app}-api`, TargetPackage.Api))
    }

    return files
  }

  const materialize: SplitTreeFixture['materialize'] = async files => {
    const root = await mkdtemp(path.join(tmpdir(), prefix))
    roots.push(root)
    for (const [file, content] of Object.entries(files)) {
      if (content == null) continue
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await writeFile(path.join(root, file), content)
    }

    return root
  }

  const cleanup: SplitTreeFixture['cleanup'] = async () => {
    await Promise.all(roots.splice(0).map(async root => await rm(root, { recursive: true, force: true })))
  }

  return { manifestOf, packageFiles, oneAppTree, splitTree, materialize, cleanup }
}
