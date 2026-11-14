import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { packageNameHelper, PackageRegistryError } from '../src/index.js'
import type { PackageFacts, PackageRegistry, RepositoryManifest } from '../src/index.js'

/** One package as a registry answered for it on the day it was recorded. */
export interface RecordedPackage {
  /** `undefined`: the registry has no such package (only its download count, if any, is known). */
  facts?: PackageFacts
  /** Weekly downloads; `null` for a name the registry does not know. */
  downloads: number | null
  /** What the repository's own manifest declares. */
  repository?: RepositoryManifest | null
}

export interface RecordedRegistry extends PackageRegistry {
  /** Every call made, as `<member>:<name>`. */
  calls: string[]
  /** The most calls that were in flight at once. */
  peak: () => number
}

/**
 * A `PackageRegistry` made of recorded registry answers — input data, not a stand-in of a service:
 * neighbours are derived the way an adapter derives them (the name helper's variants filtered to names
 * the registry knows, most downloaded first). `failing` names one member that answers with the
 * registry's outage error.
 */
export const makeRecordedRegistry = (
  records: Record<string, RecordedPackage>, failing?: keyof PackageRegistry
): RecordedRegistry => {
  const calls: string[] = []
  let inFlight = 0
  let peak = 0

  const answer = async <T>(member: keyof PackageRegistry, subject: string, value: () => T): Promise<T> => {
    calls.push(`${member}:${subject}`)
    inFlight++
    peak = Math.max(peak, inFlight)
    try {
      await new Promise(resolve => setTimeout(resolve, 1))
      if (failing === member) {
        throw new PackageRegistryError(`recorded:${member}:${subject}:503`)
      }
      return value()
    } finally {
      inFlight--
    }
  }

  const countOf = (name: string): number | null => records[name]?.downloads ?? null

  return {
    id: 'recorded',
    calls,
    peak: () => peak,
    manifest: async name => await answer('manifest', name, () => records[name]?.facts ?? null),
    downloads: async names => await answer('downloads', names.join(','), () =>
      Object.fromEntries(names.map(name => [name, countOf(name)]))),
    neighbours: async name => await answer('neighbours', name, () =>
      packageNameHelper.variants(name)
        .filter(candidate => countOf(candidate) != null)
        .sort((a, b) => (countOf(b) ?? 0) - (countOf(a) ?? 0))
        .slice(0, 5)),
    repositoryManifest: async repository => await answer('repositoryManifest', repository.url, () =>
      Object.values(records).find(record => record.facts?.repository?.url === repository.url)?.repository ?? null),
  }
}

/** A backend context for the inspector host. */
export const makeTestCtx = (): BasicContext<BasicConfig> =>
  makeBasicContext<BasicConfig>({ ready: false, service: 'package-inspector-tests', type: AppType.Backend, services: {} })
