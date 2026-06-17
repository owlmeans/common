import { existsSync, readdirSync, lstatSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface LinkedResult {
  linked: boolean
  /** Symlinked package names found in node_modules. */
  evidence: string[]
}

/**
 * Detect whether @owlmeans/* packages in node_modules are symlinked
 * (i.e. this project has them via a workspace/libraries/ dev link, not
 * from the npm registry). Returns { linked: true } if any are found.
 *
 * A package is considered linked when its node_modules/@owlmeans/<pkg>
 * entry is a symlink whose real path escapes the node_modules tree.
 *
 * This intentionally scans only the ROOT node_modules, even though discovery
 * (see discover.ts) now walks the whole tree. Dev-linked monorepos (e.g. a project
 * that symlinks the common source under libraries/*) hoist @owlmeans/* to the root
 * node_modules as escaping symlinks, so the root scan catches them. A standalone
 * scaffolded app has no root @owlmeans scope at all (its deps nest under
 * sources/*\/node_modules), so this correctly returns { linked: false } and the
 * install proceeds. Scanning nested node_modules here would risk false positives on
 * bun's in-tree store symlinks, so we deliberately do not.
 */
export const detectLinked = (targetDir: string): LinkedResult => {
  const nmScope = join(targetDir, 'node_modules', '@owlmeans')
  if (!existsSync(nmScope)) return { linked: false, evidence: [] }

  let pkgNames: string[]
  try {
    pkgNames = readdirSync(nmScope)
  } catch {
    return { linked: false, evidence: [] }
  }

  const evidence: string[] = []
  const nmDir = resolve(join(targetDir, 'node_modules'))

  for (const pkg of pkgNames) {
    const pkgPath = join(nmScope, pkg)
    try {
      const stat = lstatSync(pkgPath)
      if (stat.isSymbolicLink()) {
        evidence.push(`@owlmeans/${pkg}`)
        continue
      }
      // Also check if realpath escapes node_modules (e.g. hoisted symlink)
      const real = realpathSync(pkgPath)
      if (!real.startsWith(nmDir + '/') && !real.startsWith(nmDir + '\\')) {
        evidence.push(`@owlmeans/${pkg}`)
      }
    } catch {
      // Ignore stat errors
    }
  }

  return { linked: evidence.length > 0, evidence }
}
