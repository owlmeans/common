import { cardHelper, PlanningSchemaKind, PlanningUnsupported, SchemaConflict, SchemaInUse, scopedSchemaHelper, UnknownStatusFlow, UnknownWorkcardType, WorkcardNotFound, type PlanningDefinitions, type PlanningFacade, type PlanningSchemaRegistry, type SchemaDeclarations, type SchemaStore, type SchemaWriteOptions, type ScopedSchemaRecord, type ScopedSchemaRegistry, type StatusFlowSchema, type TransitionExecution, type Unsubscribe, type WorkcardTypeSchema } from '@owlmeans/planning'
import { DEFAULT_SCHEMA_VIEWS } from './consts.js'
import { changesUtils } from './executor/changes.js'
import type { PlanningRuntime, SchemaViews, SchemaViewsOptions } from './types.js'
import type { Planned } from './types.local.js'

const isoNow = (): string => new Date().toISOString()

/**
 * The resolved layers of one planning service, cached per (organization, project) and keyed by the
 * organization's schema revision and the code registry's version — a write anywhere, in any
 * process, moves the revision the next lookup reads, so a cached layer is never served stale. A
 * store that can `watch` evicts an organization's layers as soon as it hears of a write.
 */
export const makeSchemaViews = (opts: SchemaViewsOptions): SchemaViews => {
  const limit = opts.limit ?? DEFAULT_SCHEMA_VIEWS
  const cache = new Map<string, { revision: number, version: number, view: ScopedSchemaRegistry }>()
  let watching: { store: SchemaStore, release: Unsubscribe } | undefined

  const keyOf = (entityId: string, project?: string): string => `${entityId}\u0000${project ?? ''}`

  const evict = (entityId: string): void => {
    const prefix = `${entityId}\u0000`
    for (const key of [...cache.keys()]) {
      if (key.startsWith(prefix)) {
        cache.delete(key)
      }
    }
  }

  const scoped: SchemaViews['scoped'] = async (entityId, project) => {
    const store = opts.port()
    if (store == null) {
      throw new PlanningUnsupported('schemas')
    }
    if (store.watch != null && watching?.store !== store) {
      watching?.release()
      watching = { store, release: store.watch(evict) }
    }

    const revision = await store.revision(entityId)
    const version = opts.version()
    const key = keyOf(entityId, project)
    const hit = cache.get(key)
    if (hit != null && hit.revision === revision && hit.version === version) {
      cache.delete(key)
      cache.set(key, hit)
      return hit.view
    }

    const records = [
      ...await store.list({ entityId, project: null }),
      ...(project != null ? await store.list({ entityId, project }) : []),
    ]
    const view = scopedSchemaHelper.scopedRegistryOf(scopedSchemaHelper.resolveScopedBundle(opts.code().bundle(), records, { entityId, project, revision }))
    cache.delete(key)
    cache.set(key, { revision, version, view })
    while (cache.size > limit) {
      const oldest = cache.keys().next().value
      if (oldest == null) {
        break
      }
      cache.delete(oldest)
    }

    return view
  }

  return {
    of: async (entityId, project) => opts.port() == null ? opts.code() : await scoped(entityId, project),
    scoped,
  }
}

const planOf = (declarations: SchemaDeclarations): Planned[] => [
  ...(declarations.flows ?? []).map(flow => ({ kind: PlanningSchemaKind.Flow, key: flow.id, definition: flow })),
  ...(declarations.types ?? []).map(type => ({ kind: PlanningSchemaKind.Type, key: type.type, definition: type })),
]

const layerKey = (kind: PlanningSchemaKind, key: string): string => `${kind}:${key}`

/**
 * The data-defined schema surface of one scoped facade. Every write checks, before anything is
 * stored: the project (a project card this scope can see), the seal of the code registry, the
 * declaration's closed-form checks (a type's flows must resolve in its layer, counting the flows
 * written beside it) — and then writes through the port's compare-and-set.
 */
export const makeDefinitions = (runtime: PlanningRuntime, facade: PlanningFacade): PlanningDefinitions => {
  const scope = facade.scope
  const entityId = scope.entityId
  const now = runtime.options.now ?? isoNow

  const port = (): SchemaStore => {
    const store = runtime.schemaStore()
    if (store == null) {
      throw new PlanningUnsupported('schemas')
    }
    return store
  }

  const visible = (project: string): boolean => scope.projects == null || scope.projects.includes(project)

  /** @throws {WorkcardNotFound} for anything but a project card this scope can see */
  const assertProject = async (project?: string): Promise<void> => {
    if (project == null) {
      return
    }
    const card = await facade.cards.load(project)
    if (card == null || !cardHelper.isProject(card)) {
      throw new WorkcardNotFound(project)
    }
  }

  const layerOf = async (project?: string): Promise<Map<string, ScopedSchemaRecord>> =>
    new Map((await port().list({ entityId, project: project ?? null }))
      .map(record => [layerKey(record.kind, record.key), record]))

  /** Seal and closed-form checks for everything in the plan — nothing is written when one fails. */
  const validate = async (plan: Planned[], project?: string): Promise<void> => {
    const code = runtime.service().schemas
    const layer = await runtime.scopedSchemas(entityId, project)
    const pending = new Map(plan.filter(entry => entry.kind === PlanningSchemaKind.Flow)
      .map(entry => [entry.key, entry.definition as StatusFlowSchema]))
    const flows: Pick<PlanningSchemaRegistry, 'flow'> = { flow: id => pending.get(id) ?? layer.flow(id) }

    for (const entry of plan) {
      scopedSchemaHelper.assertOverridable(code, entry.kind, entry.key)
      if (entry.kind === PlanningSchemaKind.Flow) {
        scopedSchemaHelper.assertFlowSchema(entry.definition as StatusFlowSchema)
      } else {
        scopedSchemaHelper.assertTypeSchema(entry.definition as WorkcardTypeSchema, flows)
      }
    }
  }

  const recordOf = (
    entry: Planned, version: number, project: string | undefined, current?: ScopedSchemaRecord, retired?: boolean
  ): ScopedSchemaRecord => {
    const at = now()
    const by = changesUtils.actorOf(scope, {} as TransitionExecution)
    return Object.fromEntries(Object.entries({
      entityId,
      project,
      kind: entry.kind,
      key: entry.key,
      version,
      definition: { ...structuredClone(entry.definition), version },
      retired: retired === true ? true : undefined,
      createdAt: current?.createdAt ?? at,
      updatedAt: current != null ? at : undefined,
      by: Object.keys(by).length > 0 ? by : undefined,
    }).filter(([, value]) => value !== undefined)) as unknown as ScopedSchemaRecord
  }

  const write = async (
    plan: Planned[], opts: SchemaWriteOptions | undefined, versionOf: (entry: Planned, current?: ScopedSchemaRecord) => number | null
  ): Promise<ScopedSchemaRecord[]> => {
    await assertProject(opts?.project)
    const layer = await layerOf(opts?.project)
    const todo = plan
      .map(entry => ({ entry, current: layer.get(layerKey(entry.kind, entry.key)) }))
      .map(item => ({ ...item, version: versionOf(item.entry, item.current) }))
      .filter((item): item is typeof item & { version: number } => item.version != null)
    await validate(todo.map(item => item.entry), opts?.project)

    const written: ScopedSchemaRecord[] = []
    for (const item of todo) {
      written.push(await port().put(recordOf(item.entry, item.version, opts?.project, item.current)))
    }
    return written
  }

  const put = async (entry: Planned, opts?: SchemaWriteOptions): Promise<ScopedSchemaRecord> =>
    (await write([entry], opts, () => entry.definition.version))[0]

  const definitions: PlanningDefinitions = {
    bundle: async project => {
      await assertProject(project)
      return (await runtime.scopedSchemas(entityId, project)).bundle()
    },

    registry: async project => {
      await assertProject(project)
      return await runtime.scopedSchemas(entityId, project)
    },

    records: async opts => {
      if (typeof opts?.project === 'string' && !visible(opts.project)) {
        return []
      }
      const records = await port().list(Object.fromEntries(Object.entries({
        entityId, project: opts?.project, kind: opts?.kind, retired: opts?.retired,
      }).filter(([, value]) => value !== undefined)) as { entityId: string })
      return records.filter(record => record.project == null || visible(record.project))
    },

    putType: async (type, opts) => await put({ kind: PlanningSchemaKind.Type, key: type.type, definition: type }, opts),

    putFlow: async (flow, opts) => await put({ kind: PlanningSchemaKind.Flow, key: flow.id, definition: flow }, opts),

    define: async (declarations, opts) =>
      await write(planOf(declarations), opts, (_, current) => (current?.version ?? 0) + 1),

    seed: async (declarations, opts) => {
      const written: ScopedSchemaRecord[] = []
      try {
        written.push(...await write(planOf(declarations), opts, (_, current) => current == null ? 1 : null))
      } catch (error) {
        if (!(error instanceof SchemaConflict)) {
          throw error
        }
        // A concurrent seed wrote a key first; what is left is still only what the layer lacks.
        written.push(...await write(planOf(declarations), opts, (_, current) => current == null ? 1 : null))
      }
      return written
    },

    retire: async (kind, key, opts) => {
      await assertProject(opts?.project)
      const current = (await layerOf(opts?.project)).get(layerKey(kind, key))
      if (current == null) {
        throw kind === PlanningSchemaKind.Type ? new UnknownWorkcardType(key) : new UnknownStatusFlow(key)
      }
      if (current.retired === true) {
        return current
      }
      const retiring = recordOf({ kind, key, definition: current.definition }, current.version + 1, opts?.project, current, true)

      if (kind === PlanningSchemaKind.Flow) {
        const code = runtime.service().schemas.bundle()
        const all = (await port().list({ entityId }))
          .map(record => record.kind === kind && record.key === key && record.project === current.project ? retiring : record)
        // The organization's layer reaches every project; a project's reaches itself alone.
        const projects = opts?.project != null
          ? [opts.project]
          : [undefined, ...new Set(all.map(record => record.project).filter((id): id is string => id != null))]
        for (const project of projects) {
          const user = scopedSchemaHelper.flowInUse(scopedSchemaHelper.resolveScopedBundle(code, all, { entityId, project }), key)
          if (user != null) {
            throw new SchemaInUse(`flow:${key}:type:${user}${project != null ? `:project:${project}` : ''}`)
          }
        }
      }

      return await port().put(retiring)
    },
  }

  return definitions
}
