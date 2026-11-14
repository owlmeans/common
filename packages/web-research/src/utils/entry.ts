import type { PackageExportsMap } from '@owlmeans/package-inspector'
import {
  ENTRY_HEADING, ENTRY_ROOT_NOTE, EXPORTS_ROOT_CHARS, EXPORTS_SUBPATHS_MAX, README_IMPORT_CHARS, README_IMPORTS_MAX,
} from './entry/consts.js'
import type { PackageEntryUtils } from './entry/types.js'
import { textUtils } from './text.js'

export const createPackageEntryUtils = (): PackageEntryUtils => {
  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  /** A quoted specifier of the package — the root alone, or the root and its subpaths. */
  const specifier = (name: string, subpaths: boolean): string => `['"]${escape(name)}${subpaths ? '(?:/[^\'"\\s]*)?' : ''}['"]`

  const rootImport = (name: string): RegExp => {
    const root = specifier(name, false)
    return new RegExp(`\\bfrom\\s*${root}|\\bimport\\s*${root}|\\brequire\\(\\s*${root}\\s*\\)|\\bimport\\(\\s*${root}\\s*\\)`)
  }

  const importLine = (name: string): RegExp => {
    const spec = specifier(name, true)
    return new RegExp(
      `((?:import\\s[^\`;]*?\\bfrom\\s*${spec}|import\\s*${spec}|(?:const|let|var)\\s+[^=\`;]+=\\s*(?:await\\s+)?(?:require|import)\\(\\s*${spec}\\s*\\)|require\\(\\s*${spec}\\s*\\))[^\`]*)`,
    )
  }

  const exportsRoot = (exports: PackageExportsMap | undefined): PackageExportsMap | undefined => {
    if (exports === undefined || exports === null || typeof exports === 'string' || Array.isArray(exports)) return exports
    const keys = Object.keys(exports)
    // An object of subpaths names its root `.`; an object of conditions IS its root.
    return keys.some(key => key.startsWith('.')) ? exports['.'] : exports
  }

  const hasRoot: PackageEntryUtils['hasRoot'] = entry => {
    if (entry == null) return false
    if (entry.exports !== undefined) {
      const root = exportsRoot(entry.exports)
      return root !== undefined && root !== null && !(Array.isArray(root) && root.length === 0)
    }
    return entry.main != null || entry.module != null
  }

  const facts: PackageEntryUtils['facts'] = (name, entry) => {
    if (entry == null) return []
    const lines = [
      entry.type === 'module' ? 'Module system: ESM (`"type": "module"`)'
        : entry.type != null ? `Module system: ${entry.type === 'commonjs' ? 'CommonJS' : entry.type} (\`"type": "${entry.type}"\`)`
          : 'Module system: CommonJS by default (no `"type"` field)',
      ...(entry.main != null ? [`main: \`${entry.main}\``] : []),
      ...(entry.module != null ? [`module: \`${entry.module}\``] : []),
      ...(entry.types != null ? [`types: \`${entry.types}\``] : []),
    ]
    const exports = entry.exports
    if (exports !== undefined) {
      const root = exportsRoot(exports)
      if (root !== undefined) lines.push(`exports "." (the root): \`${textUtils.line(JSON.stringify(root), EXPORTS_ROOT_CHARS)}\``)
      if (exports !== null && typeof exports === 'object' && !Array.isArray(exports)) {
        const subpaths = Object.keys(exports).filter(key => key.startsWith('./'))
        if (subpaths.length > 0) {
          const shown = subpaths.slice(0, EXPORTS_SUBPATHS_MAX).map(key => `\`${key}\``).join(', ')
          lines.push(`exports subpaths: ${shown}${subpaths.length > EXPORTS_SUBPATHS_MAX ? ` (+${subpaths.length - EXPORTS_SUBPATHS_MAX} more)` : ''}`)
        }
      }
    }
    lines.push(hasRoot(entry)
      ? `${ENTRY_ROOT_NOTE}: \`${name}\``
      : exports !== undefined ? `Only subpaths of \`${name}\` are exported; its root is not.` : `No root entry declared for \`${name}\`.`)

    return lines.map(line => `- ${line}`)
  }

  const readmeImports: PackageEntryUtils['readmeImports'] = (name, readme) => {
    if (readme == null || readme.trim() === '') return []
    const pattern = importLine(name)
    const root = rootImport(name)
    const found: string[] = []
    for (const raw of readme.replace(/\r\n?/g, '\n').split('\n')) {
      const match = pattern.exec(raw)
      if (match == null) continue
      const line = textUtils.line(match[1]!.replace(/[;\s]+$/, '').replace(/;(\s*\/\/)/, '$1'), README_IMPORT_CHARS)
      if (!found.includes(line)) found.push(line)
    }
    const roots = found.filter(line => root.test(line))

    return [...roots, ...found.filter(line => !roots.includes(line))].slice(0, README_IMPORTS_MAX)
  }

  const importsRoot: PackageEntryUtils['importsRoot'] = (name, text) => rootImport(name).test(text)

  const rootBindings: PackageEntryUtils['rootBindings'] = (name, text) => {
    const root = specifier(name, false)
    const patterns = [
      new RegExp(`\\bimport\\s+(?!type\\s)([A-Za-z_$][\\w$]*)\\s*(?:,\\s*\\{[^}]*\\})?\\s*from\\s*${root}`, 'g'),
      new RegExp(`\\bimport\\s+\\*\\s+as\\s+([A-Za-z_$][\\w$]*)\\s+from\\s*${root}`, 'g'),
      new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*require\\(\\s*${root}\\s*\\)`, 'g'),
    ]

    return [...new Set(patterns.flatMap(pattern => [...text.matchAll(pattern)].map(match => match[1]!)))]
  }

  const section: PackageEntryUtils['section'] = (name, entry, readme) => {
    const lines = facts(name, entry)
    const imports = readmeImports(name, readme)
    if (lines.length === 0 && imports.length === 0) return ''

    return [
      ENTRY_HEADING,
      ...(lines.length > 0 ? [lines.join('\n')] : []),
      ...(imports.length > 0 ? [`Import lines in the readme:\n\n\`\`\`ts\n${imports.join('\n')}\n\`\`\``] : []),
    ].join('\n\n')
  }

  return { hasRoot, facts, readmeImports, importsRoot, rootBindings, section }
}

export const packageEntryUtils = createPackageEntryUtils()
