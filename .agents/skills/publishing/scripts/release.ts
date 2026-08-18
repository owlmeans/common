#!/usr/bin/env bun
/**
 * Release harness for the OwlMeans Common monorepo.
 *
 * Publishes **only what actually changed**, plus everything that depends on it. A package whose
 * shipped content is byte-identical to what is already on the registry keeps its version and is
 * not republished; a package that changed is bumped, and so is every package that consumes it
 * (transitively), because their dependency ranges have to move with it.
 *
 * Change is decided against **the registry**, not against git: the question a release has to
 * answer is "does what I would publish differ from what is published", and that stays answerable
 * with a dirty tree, no tags, and no release branch — none of which this repo has. The comparison
 * ignores each package's own `version` and its `@owlmeans/*` ranges, since those move mechanically
 * with every bump and would otherwise report the whole graph as changed forever.
 *
 * Publishing NEVER happens implicitly. `--plan` (the default) and `--apply` never contact the
 * registry to write; `--publish` additionally requires `--confirm`, and the operator is asked
 * before it is ever run.
 *
 * Usage:
 *   bun .agents/skills/publishing/scripts/release.ts                  # plan only (default)
 *   bun .agents/skills/publishing/scripts/release.ts --apply          # write versions + ranges
 *   bun .agents/skills/publishing/scripts/release.ts --publish --confirm
 *
 * Options:
 *   --baseline <version>  Compare against this exact published version instead of each
 *                         package's own dist-tag (useful to preview or to re-cut a release).
 *   --tag <dist-tag>      Registry dist-tag to compare against and publish to (default: latest).
 *   --set <version>       Force this version for every affected package instead of bumping.
 *   --all                 Treat every publishable package as changed (full synchronized release).
 *   --only <a,b,c>        Treat exactly these packages as changed (skips content comparison).
 *   --concurrency <n>     Parallel registry/pack operations (default: 8).
 *   --json                Emit the plan as JSON instead of a table.
 */

import { readdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '../../../..')
const INTERNAL_SCOPE = '@owlmeans/'
/** Ranges that never carry a version and must survive a bump untouched. */
const NON_VERSION_RANGE = /^(workspace:|file:|link:|npm:|git\+|https?:)/
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

interface Pkg {
  name: string
  dir: string
  version: string
  private: boolean
  json: Record<string, any>
  /** Internal package names this one depends on, across every dependency field. */
  deps: Set<string>
}

interface Args {
  plan: boolean
  apply: boolean
  publish: boolean
  confirm: boolean
  all: boolean
  json: boolean
  tag: string
  baseline?: string
  set?: string
  only?: string[]
  concurrency: number
}

const parseArgs = (argv: string[]): Args => {
  const has = (flag: string): boolean => argv.includes(flag)
  const value = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag)
    return idx >= 0 ? argv[idx + 1] : undefined
  }

  const publish = has('--publish')
  const apply = has('--apply') || publish

  return {
    publish,
    apply,
    plan: !apply,
    confirm: has('--confirm'),
    all: has('--all'),
    json: has('--json'),
    tag: value('--tag') ?? 'latest',
    baseline: value('--baseline'),
    set: value('--set'),
    only: value('--only')?.split(',').map(name => name.trim()).filter(name => name !== ''),
    concurrency: Number(value('--concurrency') ?? 8),
  }
}

/** Run a command, returning stdout and never throwing — callers decide what a failure means. */
const run = async (
  cmd: string[], cwd: string = ROOT
): Promise<{ ok: boolean, stdout: string, stderr: string }> => {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited

  return { ok: code === 0, stdout, stderr }
}

/** Bounded-concurrency map — the registry is a shared resource, not a thing to flood. */
const pooled = async <T, R>(
  items: T[], limit: number, worker: (item: T) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) {
        return
      }
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)

  return results
}

const loadPackages = async (): Promise<Pkg[]> => {
  const entries = await readdir(path.join(ROOT, 'packages'), { withFileTypes: true })
  const packages: Pkg[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const dir = path.join(ROOT, 'packages', entry.name)
    const manifest = path.join(dir, 'package.json')
    if (!existsSync(manifest)) {
      continue
    }
    const json = JSON.parse(await readFile(manifest, 'utf8')) as Record<string, any>
    if (json.name == null) {
      continue
    }

    const deps = new Set<string>()
    for (const field of DEP_FIELDS) {
      for (const [dep, range] of Object.entries(json[field] ?? {})) {
        if (dep.startsWith(INTERNAL_SCOPE) && !NON_VERSION_RANGE.test(String(range))) {
          deps.add(dep)
        }
      }
    }

    packages.push({
      name: json.name, dir, version: json.version, private: json.private === true, json, deps,
    })
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * A package.json reduced to the parts that describe *content* rather than release bookkeeping.
 *
 * `version` and every internal range are dropped: they change on every bump by construction, so
 * leaving them in would make each release mark the entire graph as changed and defeat the point.
 */
const normalizeManifest = (raw: string): string => {
  const json = JSON.parse(raw) as Record<string, any>
  delete json.version
  for (const field of DEP_FIELDS) {
    for (const [dep, range] of Object.entries(json[field] ?? {})) {
      if (dep.startsWith(INTERNAL_SCOPE) && !NON_VERSION_RANGE.test(String(range))) {
        json[field][dep] = '*'
      }
    }
  }

  return JSON.stringify(json, Object.keys(json).sort())
}

const hashFiles = async (
  files: Array<{ path: string, read: () => Promise<Buffer | string> }>
): Promise<string> => {
  const digest = createHash('sha256')
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  for (const file of sorted) {
    const content = await file.read()
    const body = file.path === 'package.json'
      ? normalizeManifest(typeof content === 'string' ? content : content.toString('utf8'))
      : content
    digest.update(file.path)
    digest.update('\0')
    digest.update(body as any)
    digest.update('\0')
  }

  return digest.digest('hex')
}

/** Content hash of what `npm publish` would upload from the working tree. */
const hashLocal = async (pkg: Pkg): Promise<string | null> => {
  const packed = await run(['npm', 'pack', '--dry-run', '--json'], pkg.dir)
  if (!packed.ok) {
    return null
  }
  let listing: Array<{ files?: Array<{ path: string }> }>
  try {
    listing = JSON.parse(packed.stdout)
  } catch {
    return null
  }
  const files = listing[0]?.files ?? []

  return await hashFiles(files.map(file => ({
    path: file.path,
    read: async () => await readFile(path.join(pkg.dir, file.path)),
  })))
}

/** Content hash of a version already on the registry, or null when it was never published. */
const hashPublished = async (name: string, spec: string): Promise<string | null> => {
  const workdir = await mkdtemp(path.join(tmpdir(), 'owlmeans-release-'))
  try {
    const packed = await run(['npm', 'pack', `${name}@${spec}`, '--pack-destination', workdir], workdir)
    if (!packed.ok) {
      return null
    }
    const tarballs = (await readdir(workdir)).filter(file => file.endsWith('.tgz'))
    if (tarballs.length === 0) {
      return null
    }
    const extracted = path.join(workdir, 'extracted')
    const untar = await run(['sh', '-c', `mkdir -p ${extracted} && tar -xzf ${path.join(workdir, tarballs[0])} -C ${extracted}`], workdir)
    if (!untar.ok) {
      return null
    }
    const base = path.join(extracted, 'package')
    const walk = async (dir: string, prefix = ''): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true })
      const found: string[] = []
      for (const entry of entries) {
        const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
        if (entry.isDirectory()) {
          found.push(...await walk(path.join(dir, entry.name), rel))
        } else {
          found.push(rel)
        }
      }
      return found
    }
    const files = await walk(base)

    return await hashFiles(files.map(rel => ({
      path: rel,
      read: async () => await readFile(path.join(base, rel)),
    })))
  } finally {
    await rm(workdir, { recursive: true, force: true })
  }
}

/** Increment the trailing number of a prerelease, else the patch. */
const bump = (version: string): string => {
  const [core, pre] = version.split('-', 2)
  if (pre != null && pre !== '') {
    const parts = pre.split('.')
    const last = parts.length - 1
    const n = Number(parts[last])
    if (Number.isFinite(n)) {
      parts[last] = String(n + 1)
      return `${core}-${parts.join('.')}`
    }
    return `${core}-${pre}.1`
  }
  const [major, minor, patch] = core.split('.')
  return `${major}.${minor}.${Number(patch) + 1}`
}

/** Everything that must ship because something it depends on is shipping. Cycle-safe. */
const closeOverDependents = (packages: Pkg[], seed: Set<string>): Set<string> => {
  const dependents = new Map<string, string[]>()
  for (const pkg of packages) {
    for (const dep of pkg.deps) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), pkg.name])
    }
  }

  const affected = new Set(seed)
  const queue = [...seed]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const dependent of dependents.get(current) ?? []) {
      if (!affected.has(dependent)) {
        affected.add(dependent)
        queue.push(dependent)
      }
    }
  }

  return affected
}

/** Dependencies before dependents; cycles are emitted in a stable arbitrary order. */
const publishOrder = (packages: Pkg[], names: Set<string>): string[] => {
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]))
  const ordered: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()

  const visit = (name: string): void => {
    if (state.get(name) != null || !names.has(name)) {
      return
    }
    state.set(name, 'visiting')
    for (const dep of byName.get(name)?.deps ?? []) {
      if (state.get(dep) !== 'visiting') {
        visit(dep)
      }
    }
    state.set(name, 'done')
    ordered.push(name)
  }

  for (const name of [...names].sort()) {
    visit(name)
  }

  return ordered
}

const main = async (): Promise<number> => {
  const args = parseArgs(process.argv.slice(2))

  // Checked before anything is read, compared or written: `--publish` implies `--apply`, so a
  // refusal further down would still have rewritten every affected manifest on the way to it —
  // leaving the tree bumped for a release that was declined.
  if (args.publish && !args.confirm) {
    console.error('Refusing to publish without --confirm. Publishing is irreversible and public;')
    console.error('the operator has to agree to it explicitly, every time. Nothing was written.')
    return 1
  }

  const packages = await loadPackages()
  const publishable = packages.filter(pkg => !pkg.private)

  // --- 1. what changed -----------------------------------------------------------------------
  let changed: Set<string>
  const unpublished: string[] = []

  if (args.all) {
    changed = new Set(publishable.map(pkg => pkg.name))
  } else if (args.only != null) {
    const known = new Set(publishable.map(pkg => pkg.name))
    const unknown = args.only.filter(name => !known.has(name))
    if (unknown.length > 0) {
      console.error(`Unknown package(s): ${unknown.join(', ')}`)
      return 1
    }
    changed = new Set(args.only)
  } else {
    if (!args.json) {
      console.error(`Comparing ${publishable.length} packages against the registry (${args.baseline ?? args.tag})...`)
    }
    const verdicts = await pooled(publishable, args.concurrency, async pkg => {
      const spec = args.baseline ?? args.tag
      const [local, published] = await Promise.all([hashLocal(pkg), hashPublished(pkg.name, spec)])
      if (published == null) {
        unpublished.push(pkg.name)
        return { name: pkg.name, changed: true }
      }
      // A local hash we could not compute is not evidence of "unchanged" — ship it and let the
      // registry reject a duplicate rather than silently skip a package that may have changed.
      return { name: pkg.name, changed: local == null || local !== published }
    })
    changed = new Set(verdicts.filter(verdict => verdict.changed).map(verdict => verdict.name))
  }

  const affected = closeOverDependents(publishable, changed)
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]))
  const nextVersion = new Map<string, string>()
  for (const name of affected) {
    const pkg = byName.get(name)!
    nextVersion.set(name, args.set ?? bump(pkg.version))
  }

  // --- 2. report -----------------------------------------------------------------------------
  const order = publishOrder(publishable, affected)
  if (args.json) {
    console.log(JSON.stringify({
      changed: [...changed].sort(),
      dependents: order.filter(name => !changed.has(name)),
      order,
      versions: Object.fromEntries(nextVersion),
      unpublished,
    }, null, 2))
  } else {
    console.log('')
    if (affected.size === 0) {
      console.log('Nothing changed — every publishable package matches the registry. No release needed.')
    } else {
      console.log(`Changed:    ${changed.size}`)
      console.log(`Dependents: ${affected.size - changed.size}`)
      console.log(`To publish: ${affected.size} of ${publishable.length}`)
      if (unpublished.length > 0) {
        console.log(`Never published: ${unpublished.join(', ')}`)
      }
      console.log('')
      for (const name of order) {
        const pkg = byName.get(name)!
        const reason = changed.has(name) ? 'changed' : 'dependent'
        console.log(`  ${reason.padEnd(9)} ${name.padEnd(38)} ${pkg.version} -> ${nextVersion.get(name)}`)
      }
      console.log('')
    }
  }

  if (affected.size === 0 || !args.apply) {
    if (affected.size > 0 && !args.json) {
      console.log('Plan only. Re-run with --apply to write versions, then --publish --confirm to release.')
    }
    return 0
  }

  // --- 3. write versions and ranges ----------------------------------------------------------
  for (const pkg of packages) {
    const manifestPath = path.join(pkg.dir, 'package.json')
    const raw = await readFile(manifestPath, 'utf8')
    const json = JSON.parse(raw) as Record<string, any>
    let touched = false

    const own = nextVersion.get(pkg.name)
    if (own != null && json.version !== own) {
      json.version = own
      touched = true
    }
    // Any consumer of a bumped package is itself in `affected`, so this only ever rewrites
    // manifests that are being released — a package left behind keeps ranges that still resolve.
    for (const field of DEP_FIELDS) {
      for (const [dep, range] of Object.entries(json[field] ?? {})) {
        const bumped = nextVersion.get(dep)
        if (bumped == null || NON_VERSION_RANGE.test(String(range))) {
          continue
        }
        const prefix = String(range).startsWith('^') ? '^' : String(range).startsWith('~') ? '~' : ''
        const updated = `${prefix}${bumped}`
        if (range !== updated) {
          json[field][dep] = updated
          touched = true
        }
      }
    }

    if (touched) {
      await writeFile(manifestPath, `${JSON.stringify(json, null, 2)}\n`)
    }
  }
  console.log(`Wrote versions for ${affected.size} package(s) and realigned dependent ranges.`)
  console.log('Run `bun install` and `bun run build` before publishing.')

  if (!args.publish) {
    return 0
  }

  // --- 4. publish ----------------------------------------------------------------------------
  let failed = 0
  for (const name of order) {
    const pkg = byName.get(name)!
    const result = await run(['npm', 'publish', '--access', 'public', '--tag', args.tag], pkg.dir)
    if (result.ok) {
      console.log(`OK    ${name}@${nextVersion.get(name)}`)
    } else {
      failed += 1
      console.error(`FAIL  ${name}: ${result.stderr.trim().split('\n').slice(-3).join(' | ')}`)
    }
  }
  console.log(`\nPublished ${order.length - failed}/${order.length}${failed > 0 ? ` (${failed} failed)` : ''}.`)

  return failed > 0 ? 1 : 0
}

process.exit(await main())
