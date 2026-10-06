import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { PlanningUnsupported, SchemaWriteMode, scopedSchemaHelper } from '@owlmeans/planning'
import type {
  PlanningProtocols, SchemaDefineReply, SchemaDefineRequest, ScopedSchemaRegistry,
} from '@owlmeans/planning'
import type { RemoteDefinitions, RemoteDefinitionsOptions } from './types.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

/**
 * Data-defined types and flows over a tree declared with `definitions: true`: a layer's registry is
 * read through `schema.list` (with its `project`) and cached per project; every write goes through
 * `schema.define` and drops the whole cache — an organization-wide write reaches every project's
 * layer. The records of a layer are the server's alone (`records` refuses).
 *
 * @throws {PlanningUnsupported} for a tree declared without `definitions`
 */
export const makeRemoteDefinitions = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, protocols: PlanningProtocols, opts: RemoteDefinitionsOptions = {}
): RemoteDefinitions => {
  const define = protocols.schema.define
  if (define == null) {
    throw new PlanningUnsupported('client:definitions')
  }
  const cache = new Map<string, Promise<ScopedSchemaRegistry>>()

  const invalidate = (): void => {
    cache.clear()
    opts.onWrite?.()
  }

  const registry = (project?: string): Promise<ScopedSchemaRegistry> => {
    const key = project ?? ''
    let entry = cache.get(key)
    if (entry == null) {
      const loading = (async () => scopedSchemaHelper.scopedRegistryOf(await context.entrypoint(protocols.schema.list).call({
        query: project != null ? { project } : {}, timeout: opts.timeout,
      })))()
      entry = loading
      cache.set(key, loading)
      // A failed read is forgotten, so the next caller asks again instead of inheriting the error.
      loading.catch(() => {
        if (cache.get(key) === loading) {
          cache.delete(key)
        }
      })
    }
    return entry
  }

  const write = async (request: SchemaDefineRequest): Promise<SchemaDefineReply> => {
    try {
      return await context.entrypoint(define).call({ body: clean(request), timeout: opts.timeout })
    } finally {
      invalidate()
    }
  }

  return {
    bundle: async project => (await registry(project)).bundle(),

    registry,

    records: async () => {
      throw new PlanningUnsupported('client:definitions:records')
    },

    putType: async (type, layer) =>
      (await write({ project: layer?.project, mode: SchemaWriteMode.Put, types: [type] })).records[0],

    putFlow: async (flow, layer) =>
      (await write({ project: layer?.project, mode: SchemaWriteMode.Put, flows: [flow] })).records[0],

    define: async (declarations, layer) =>
      (await write({ project: layer?.project, mode: SchemaWriteMode.Define, ...declarations })).records,

    seed: async (declarations, layer) =>
      (await write({ project: layer?.project, mode: SchemaWriteMode.Seed, ...declarations })).records,

    retire: async (kind, key, layer) => {
      const { records } = await write({ project: layer?.project, retire: [{ kind, key }] })
      return records[records.length - 1]
    },

    invalidate,
  }
}
