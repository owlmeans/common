import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { DEFAULT_NOTICE_FILE, NO_NOTICE_LICENSE, NOTICE_DOCUMENT } from './notices/consts.js'
import fallbacks from './notices/fallbacks.json' with { type: 'json' }

/** @type {(options: import('./notices/types.js').ThirdPartyNoticesOptions) => import('./notices/types.js').ThirdPartyNoticesPlugin} */
export const createThirdPartyNoticesPlugin = (options) => {
  const root = resolve(options.root)
  const require = createRequire(join(root, 'package.json'))

  const packageOf = (file) => {
    // Some packages put named package.json files in export subdirectories (e.g. resolvers/ajv).
    // Their copyright and license belong to the containing installed package, not that subpath.
    const marker = '/node_modules/'
    const installed = file.lastIndexOf(marker)
    if (installed !== -1) {
      const start = file.slice(0, installed + marker.length)
      const parts = file.slice(installed + marker.length).split('/')
      const dir = join(start, ...parts.slice(0, parts[0].startsWith('@') ? 2 : 1))
      const manifest = join(dir, 'package.json')
      if (existsSync(manifest)) return { dir: realpathSync(dir), json: JSON.parse(readFileSync(manifest, 'utf8')) }
    }
    let dir = dirname(file)
    while (true) {
      const manifest = join(dir, 'package.json')
      if (existsSync(manifest)) {
        const json = JSON.parse(readFileSync(manifest, 'utf8'))
        if (json.name) return { dir: realpathSync(dir), json }
      }
      const parent = dirname(dir)
      if (parent === dir) return null
      dir = parent
    }
  }

  // Resolve the package directory even when its exports hide package.json or it exports CSS only.
  const installedPackage = (name) => {
    for (const search of require.resolve.paths(name) ?? []) {
      const manifest = join(search, name, 'package.json')
      if (existsSync(manifest)) return packageOf(manifest)
    }
    throw new Error(`Third-party notices: cannot resolve ${name} from ${root}`)
  }

  return {
    name: 'owlmeans:third-party-notices',
    generateBundle(_, bundle) {
      const packages = new Map()
      const nestedDocuments = new Map()
      const scanned = new Set()
      const addPackage = (pkg) => {
        if (pkg != null) packages.set(pkg.dir, pkg)
      }
      // Include the app's copied-source notices even when all its UI is generated or inlined.
      addPackage(packageOf(join(root, 'package.json')))
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        for (const id of Object.keys(output.modules ?? Object.fromEntries((output.moduleIds ?? []).map(id => [id, true])))) {
          if (/\bvite\/(?:modulepreload-polyfill|preload-helper)/.test(id)) addPackage(installedPackage('vite'))
          const file = id.replace(/^\0/, '').split('?')[0]
          if (isAbsolute(file) && existsSync(file)) {
            const pkg = packageOf(file)
            addPackage(pkg)
            // Vendored code can carry its own license below the package root (victory-vendor).
            let dir = dirname(realpathSync(file))
            while (pkg && dir.startsWith(pkg.dir + '/') && !scanned.has(dir)) {
              scanned.add(dir)
              for (const name of readdirSync(dir)) {
                const path = join(dir, name)
                if (NOTICE_DOCUMENT.test(name) && statSync(path).isFile()) {
                  nestedDocuments.set(`${pkg.json.name}@${pkg.json.version} — ${relative(pkg.dir, path)}`, path)
                }
              }
              dir = dirname(dir)
            }
          }
        }
      }
      for (const name of options.additionalPackages ?? []) addPackage(installedPackage(name))

      const documents = new Map()
      const contents = new Set()
      const addDocument = (label, file, suppliedText) => {
        const text = suppliedText ?? readFileSync(file, 'utf8')
        if (text.trim() === '') throw new Error(`Third-party notices: empty ${file}`)
        if (!contents.has(text)) {
          documents.set(label, text)
          contents.add(text)
        }
      }
      const missing = []
      for (const { dir, json } of [...packages.values()].sort((a, b) => a.dir.localeCompare(b.dir))) {
        const files = readdirSync(dir).filter(name => NOTICE_DOCUMENT.test(name) && statSync(join(dir, name)).isFile()).sort()
        const thirdParty = dir.includes('/node_modules/') && !json.name.startsWith('@owlmeans/')
        if (thirdParty && !NO_NOTICE_LICENSE.test(json.license ?? '')) {
          if (!files.some(name => /^(?:licen[cs]e|copying)/i.test(name))) {
            const readme = readdirSync(dir).find(name => /^readme(?:\.|$)/i.test(name))
            const text = readme ? readFileSync(join(dir, readme), 'utf8') : ''
            const start = text.search(/^(?:#{1,6}\s+)?(?:\(?The\s+)?(?:MIT\s+)?Licen[cs]e\b.*$/im)
            const section = start === -1 ? '' : text.slice(start)
            if (['copyright', 'permission is hereby granted', 'the software is provided'].every(part => section.toLowerCase().includes(part))) {
              addDocument(`${json.name}@${json.version} — ${readme} (license section)`, '', section)
            } else if (fallbacks[`${json.name}@${json.version}`]) {
              const fallback = fallbacks[`${json.name}@${json.version}`]
              addDocument(`${json.name}@${json.version} — license (${fallback.source})`, new URL(`./notices/${fallback.file}`, import.meta.url))
            } else {
              missing.push(`${json.name}@${json.version} (${dir})`)
            }
          }
        }
        for (const name of files) {
          if (thirdParty && NO_NOTICE_LICENSE.test(json.license ?? '') && /^(?:licen[cs]e|copying)/i.test(name)) continue
          addDocument(`${json.name}${json.version ? `@${json.version}` : ''} — ${name}`, join(dir, name))
        }
      }
      if (missing.length) throw new Error(`Third-party notices: missing license text for ${missing.join('\n')}`)
      for (const [label, file] of [...nestedDocuments].sort(([a], [b]) => a.localeCompare(b))) addDocument(label, file)
      for (const file of options.additionalFiles ?? []) addDocument(file, resolve(root, file))
      const sections = [...documents].sort(([a], [b]) => a.localeCompare(b)).map(([label, text]) => `${label}\n${'='.repeat(label.length)}\n\n${text}`)
      const references = options.references?.length ? `\nAdditional runtime notices\n\n${options.references.join('\n')}\n` : ''
      this.emitFile({
        type: 'asset',
        fileName: options.fileName ?? DEFAULT_NOTICE_FILE,
        source: `Third-party licenses and notices\n\n${sections.join('\n\n')}${references}\n`,
      })
    },
  }
}
