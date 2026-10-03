import { ObjectId } from 'mongodb'
import { config as serverConfig, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { applyQuery, firstMatch, matchCriteria, RecordExists, UnknownRecordError } from '@owlmeans/resource'
import type { Criteria, ListOptions, ResourceRecord } from '@owlmeans/resource'
import { marshalReference } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import { appendAuthIdentityResources } from '../src/helper.js'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_EVENTS, AUTH_IDENTITY_LINKING,
  AUTH_IDENTITY_ORG_ENTITY, AUTH_IDENTITY_PROFILE,
} from '../src/consts.js'
import type {
  EntityCreatedEvent, IdentityEventsService, IdentityLinkingService, ProfileCreatedEvent,
} from '../src/types.js'

type Rec = Record<string, any>

const duplicate = (): Error => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })

/** A tick between every store call, so concurrent callers interleave the way they do against a database. */
const tick = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }

/** The raw filter's values as records carry them: `_id` is `id`, an `ObjectId` its hex string. */
const plainOf = (value: unknown): unknown => {
  if (value instanceof ObjectId) return value.toHexString()
  if (Array.isArray(value)) return value.map(plainOf)
  if (value != null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key === '_id' ? 'id' : key, plainOf(entry)]))
  }
  return value
}

const reach = (record: Rec, path: string): unknown =>
  path.split('.').reduce<unknown>((value, step) => value == null ? undefined : (value as Rec)[step], record)

/** The native operators the identity store sends (`$elemMatch`, `$not`) over the shared criteria engine. */
const matchRaw = (row: Rec, filter: Rec): boolean => Object.entries(filter).every(([key, cond]) => {
  if (cond != null && typeof cond === 'object' && '$elemMatch' in cond) {
    const items = reach(row, key)
    return Array.isArray(items) && items.some(item => matchCriteria(item, cond.$elemMatch))
  }
  if (cond != null && typeof cond === 'object' && '$not' in cond) {
    return !matchRaw(row, { [key]: cond.$not })
  }
  return matchCriteria(row, { [key]: cond })
})

const setPath = (doc: Rec, path: string, value: unknown): void => {
  const steps = path.split('.')
  let target = doc
  for (const step of steps.slice(0, -1)) {
    target[step] ??= {}
    target = target[step]
  }
  target[steps[steps.length - 1]!] = value
}

/** `$set` (dotted, and the positional `array.$` the filter's `$elemMatch` selects), `$push`, `$pull`. */
const applyUpdate = (doc: Rec, update: Rec, filter: Rec): void => {
  for (const [path, value] of Object.entries(update.$set ?? {})) {
    if (path.endsWith('.$')) {
      const field = path.slice(0, -2)
      const items = doc[field] as Rec[]
      const at = items.findIndex(item => matchCriteria(item, filter[field].$elemMatch))
      items[at] = structuredClone(value) as Rec
      continue
    }
    setPath(doc, path, structuredClone(value))
  }
  for (const [field, value] of Object.entries(update.$push ?? {})) {
    doc[field] = [...(doc[field] ?? []), structuredClone(value)]
  }
  for (const [field, where] of Object.entries(update.$pull ?? {})) {
    doc[field] = (doc[field] ?? []).filter((item: Rec) => !matchCriteria(item, where as Rec))
  }
}

export interface MemoryStore {
  rows: Rec[]
  /** Records ever created, a rolled-back race included. */
  created: number
}

/**
 * Turn a real resource (its maker's indexes and declared references kept) into an in-memory one
 * over the shared criteria engine, plus the native `updateOne` the field-level writes go through.
 * Unique indexes are enforced as Mongo enforces them, and a declared reference refuses a value that
 * is not a record id, exactly like the real resource's marshalling does.
 */
export const memoryResource = <T extends ResourceRecord>(resource: MongoResource<T>): MemoryStore => {
  const store: MemoryStore = { rows: [], created: 0 }
  const unique = (resource.indexes ?? []).filter(index => index.options?.unique === true)
    .map(index => ({ keys: Object.keys(index.index as Rec), sparse: index.options?.sparse === true }))
  const plain = (value: unknown): unknown => value instanceof Date ? value.getTime() : JSON.stringify(value)
  const violates = (doc: Rec, self?: Rec): boolean => unique.some(({ keys, sparse }) =>
    !(sparse && keys.every(key => doc[key] == null)) && store.rows.some(row =>
      row !== self && keys.every(key => plain(row[key] ?? null) === plain(doc[key] ?? null))))
  const checkRefs = (doc: Rec): void => {
    for (const ref of resource.references()) marshalReference(ref.field, doc[ref.field])
  }
  const out = (row: Rec): T => structuredClone(row) as T
  const byId = (id: string) => store.rows.find(row => row.id === id)
  const find = (idOrWhere: string | Criteria<T>, opts?: { sort?: never[] }) =>
    typeof idOrWhere === 'string' ? byId(idOrWhere) : firstMatch(store.rows, idOrWhere as Criteria<any>, opts)

  const target = resource as unknown as Rec
  target.init = async () => undefined
  target.get = async (idOrWhere: string | Criteria<T>, opts?: { sort?: never[] }) => {
    await tick()
    const row = find(idOrWhere, opts)
    if (row == null) throw new UnknownRecordError(JSON.stringify(idOrWhere))
    return out(row)
  }
  target.load = async (idOrWhere: string | Criteria<T>, opts?: { sort?: never[] }) => {
    await tick()
    const row = find(idOrWhere, opts)
    return row == null ? null : out(row)
  }
  target.list = async (where?: Criteria<T>, opts?: ListOptions<T>) => {
    await tick()
    const result = applyQuery(store.rows, where as Criteria<any>, opts as ListOptions<any>)
    return { ...result, items: result.items.map(out) }
  }
  target.count = async (where?: Criteria<T>) => store.rows.filter(row => matchCriteria(row, where)).length
  target.create = async (record: Rec) => {
    await tick()
    if (record.id != null) throw new RecordExists('id-present')
    const doc = Object.fromEntries(Object.entries(structuredClone(record)).filter(([, value]) => value !== undefined))
    checkRefs(doc)
    if (violates(doc)) throw duplicate()
    doc.id = new ObjectId().toHexString()
    store.rows.push(doc)
    store.created++
    return out(doc)
  }
  target.update = async () => {
    throw new Error(`${resource.alias}: a whole-record update — the identity store writes field by field`)
  }
  target.delete = async (id: string) => {
    await tick()
    const row = byId(id)
    if (row == null) return null
    store.rows = store.rows.filter(item => item !== row)
    return out(row)
  }
  target.collection = {
    updateOne: async (raw: Rec, update: Rec) => {
      await tick()
      const filter = plainOf(raw) as Rec
      const found = store.rows.find(row => matchRaw(row, filter))
      if (found == null) return { matchedCount: 0, modifiedCount: 0 }
      const candidate = structuredClone(found)
      applyUpdate(candidate, update, filter)
      checkRefs(candidate)
      // Like Mongo: an update is checked against the unique indexes before it lands.
      if (violates(candidate, found)) throw duplicate()
      store.rows[store.rows.indexOf(found)] = candidate
      return { matchedCount: 1, modifiedCount: 1 }
    },
  }

  return store
}

export interface IdentityHarness {
  ctx: ServerContext<ServerConfig>
  stores: {
    accounts: MemoryStore
    profiles: MemoryStore
    credentials: MemoryStore
    entities: MemoryStore
  }
  linking: IdentityLinkingService
  events: IdentityEventsService
  entityCreated: EntityCreatedEvent[]
  profileCreated: ProfileCreatedEvent[]
}

/** A real server context — the package's own registration — over in-memory resources. */
export const makeIdentityContext = async (opts: { service?: string } = {}): Promise<IdentityHarness> => {
  const ctx = makeServerContext(serverConfig<ServerConfig>('test-service')) as ServerContext<ServerConfig>
  appendAuthIdentityResources(ctx, undefined, opts.service != null ? { service: opts.service } : {})
  const stores = {
    accounts: memoryResource(ctx.resource(AUTH_IDENTITY_ACCOUNT)),
    profiles: memoryResource(ctx.resource(AUTH_IDENTITY_PROFILE)),
    credentials: memoryResource(ctx.resource(AUTH_IDENTITY_CREDENTIALS)),
    entities: memoryResource(ctx.resource(AUTH_IDENTITY_ORG_ENTITY)),
  }
  ctx.configure()
  await ctx.init()

  const events = ctx.service<IdentityEventsService>(AUTH_IDENTITY_EVENTS)
  const entityCreated: EntityCreatedEvent[] = []
  const profileCreated: ProfileCreatedEvent[] = []
  events.onEntityCreated(async event => { entityCreated.push(event) })
  events.onProfileCreated(async event => { profileCreated.push(event) })

  return {
    ctx, stores, events, entityCreated, profileCreated,
    linking: ctx.service<IdentityLinkingService>(AUTH_IDENTITY_LINKING),
  }
}

export const details = (type: string, sub: string, service: string = type) => ({
  type, service, clientId: service, userId: sub,
})
