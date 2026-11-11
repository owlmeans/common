import { RecordExists, UnknownRecordError, type Criteria, type ListOptions, type ResourceRecord, recordQueryHelper } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { MemoryStore } from './memory/types.js'

type Rec = Record<string, any>

const duplicate = (): Error => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })

const plain = (value: unknown): unknown => value instanceof Date ? value.getTime() : value

const withoutUndefined = <T extends Rec>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

const applyUpdate = (doc: Rec, update: Rec, inserting: boolean): void => {
  for (const [key, value] of Object.entries(update.$set ?? {})) {
    if (value === undefined) continue
    doc[key] = value
  }
  for (const [key, value] of Object.entries(update.$inc ?? {})) {
    doc[key] = (doc[key] ?? 0) + (value as number)
  }
  for (const key of Object.keys(update.$unset ?? {})) {
    delete doc[key]
  }
  if (inserting) {
    Object.assign(doc, update.$setOnInsert ?? {})
  }
}


/**
 * Turn a real resource (its maker's indexes and helpers kept) into an in-memory one over the shared
 * criteria engine, including the raw collection calls the package makes: the conditional counter
 * upsert, `$inc` / `$set` / `$unset`, `$match` + `$group` aggregation and `distinct`.
 */
export const memoryResource = <T extends ResourceRecord>(resource: MongoResource<T>): MemoryStore => {
  const store: MemoryStore = { rows: [], failing: new Set() }
  const unique = (resource.indexes ?? []).filter(index => index.options?.unique === true)
    .map(index => ({ keys: Object.keys(index.index as Rec), sparse: index.options?.sparse === true }))
  let seq = 0
  const guard = (method: string): void => {
    if (store.failing.has(method)) throw new Error(`${resource.alias}.${method} unavailable`)
  }
  // A sparse unique index ignores a document that carries none of its keys (as Mongo does).
  const violates = (doc: Rec, self?: Rec): boolean => unique.some(({ keys, sparse }) =>
    !(sparse && keys.every(key => doc[key] == null)) && store.rows.some(row =>
      row !== self && keys.every(key => plain(row[key] ?? null) === plain(doc[key] ?? null))))
  const out = (row: Rec): T => structuredClone(row) as T
  const byId = (id: string) => store.rows.find(row => row.id === id)

  const target = resource as unknown as Rec
  target.init = async () => undefined
  target.get = async (idOrWhere: string | Criteria<T>, opts?: { sort?: never[] }) => {
    guard('get')
    const row = typeof idOrWhere === 'string' ? byId(idOrWhere) : recordQueryHelper.firstMatch(store.rows, idOrWhere as Criteria<any>, opts)
    if (row == null) throw new UnknownRecordError(JSON.stringify(idOrWhere))
    return out(row)
  }
  target.load = async (idOrWhere: string | Criteria<T>, opts?: { sort?: never[] }) => {
    guard('load')
    const row = typeof idOrWhere === 'string' ? byId(idOrWhere) : recordQueryHelper.firstMatch(store.rows, idOrWhere as Criteria<any>, opts)
    return row == null ? null : out(row)
  }
  target.list = async (where?: Criteria<T>, opts?: ListOptions<T>) => {
    guard('list')
    const result = recordQueryHelper.applyQuery(store.rows, where as Criteria<any>, opts as ListOptions<any>)
    return { ...result, items: result.items.map(out) }
  }
  target.count = async (where?: Criteria<T>) => store.rows.filter(row => recordQueryHelper.matchCriteria(row, where)).length
  target.create = async (record: Rec) => {
    guard('create')
    if (record.id != null) throw new RecordExists('id-present')
    const doc = withoutUndefined(structuredClone(record))
    delete doc.id
    if (violates(doc)) throw duplicate()
    doc.id = `${resource.alias}-${++seq}`
    store.rows.push(doc)
    return out(doc)
  }
  target.update = async (record: Rec) => {
    guard('update')
    const existing = byId(record.id)
    if (existing == null) throw new UnknownRecordError(String(record.id))
    const doc = withoutUndefined(structuredClone(record))
    if (violates(doc, existing)) throw duplicate()
    store.rows[store.rows.indexOf(existing)] = doc
    return out(doc)
  }
  target.save = async (record: Rec) => record.id != null ? await target.update(record) : await target.create(record)
  target.delete = async (id: string) => {
    const row = byId(id)
    if (row == null) return null
    store.rows = store.rows.filter(item => item !== row)
    return out(row)
  }
  target.purge = async (where: Criteria<T>) => {
    const before = store.rows.length
    store.rows = store.rows.filter(row => !recordQueryHelper.matchCriteria(row, where))
    return before - store.rows.length
  }

  // A raw filter addresses a record by `_id` (`paymentUtils.idCriteria`); the rows carry it as `id`.
  const rawFilter = (filter: Rec): Rec => {
    if (!('_id' in filter)) return filter
    const { _id: rawId, ...rest } = filter
    return { ...rest, id: String(rawId) }
  }
  const matchRaw = (filter: Rec) => store.rows.find(row => recordQueryHelper.matchCriteria(row, rawFilter(filter)))
  const upsert = (filter: Rec, update: Rec, opts: Rec = {}): { doc: Rec | null, inserted: boolean } => {
    const found = matchRaw(filter)
    if (found != null) {
      applyUpdate(found, update, false)
      return { doc: found, inserted: false }
    }
    if (opts.upsert !== true) return { doc: null, inserted: false }
    const doc: Rec = Object.fromEntries(Object.entries(rawFilter(filter)).filter(([, value]) =>
      value === null || typeof value !== 'object' || value instanceof Date))
    applyUpdate(doc, update, true)
    if (violates(doc)) throw duplicate()
    doc.id = `${resource.alias}-${++seq}`
    store.rows.push(doc)
    return { doc, inserted: true }
  }
  target.collection = {
    findOneAndUpdate: async (filter: Rec, update: Rec, opts: Rec = {}) => {
      guard('findOneAndUpdate')
      const before = matchRaw(filter)
      const snapshot = before != null ? structuredClone(before) : null
      const { doc } = upsert(filter, update, opts)
      if (doc == null) return null
      const result = opts.returnDocument === 'after' ? doc : snapshot
      return result == null ? null : { ...structuredClone(result), _id: result.id }
    },
    updateOne: async (filter: Rec, update: Rec, opts: Rec = {}) => {
      guard('updateOne')
      // Like Mongo: an update is checked against the unique indexes before it lands.
      const found = matchRaw(filter)
      if (found != null) {
        const candidate = structuredClone(found)
        applyUpdate(candidate, update, false)
        if (violates(candidate, found)) throw duplicate()
      }
      const { doc, inserted } = upsert(filter, update, opts)
      return { matchedCount: doc != null && !inserted ? 1 : 0, upsertedCount: inserted ? 1 : 0 }
    },
    deleteOne: async (filter: Rec) => {
      const row = matchRaw(filter)
      store.rows = store.rows.filter(item => item !== row)
      return { deletedCount: row != null ? 1 : 0 }
    },
    distinct: async (field: string, filter: Rec = {}) =>
      [...new Set(store.rows.filter(row => recordQueryHelper.matchCriteria(row, filter)).map(row => row[field]))],
    aggregate: (pipeline: Rec[]) => ({
      toArray: async () => {
        guard('aggregate')
        let docs: Rec[] = store.rows.map(row => structuredClone(row))
        for (const stage of pipeline) {
          if (stage.$match != null) {
            docs = docs.filter(doc => recordQueryHelper.matchCriteria(doc, stage.$match))
          } else if (stage.$group != null) {
            const groups = new Map<string, Rec>()
            const { _id: key, ...accumulators } = stage.$group
            for (const doc of docs) {
              const id = Object.fromEntries(Object.entries(key as Rec).map(([name, ref]) => [name, doc[(ref as string).slice(1)]]))
              const hash = JSON.stringify(id)
              const group = groups.get(hash) ?? { _id: id }
              for (const [name, spec] of Object.entries(accumulators as Rec)) {
                group[name] = (group[name] ?? 0) + (doc[(spec.$sum as string).slice(1)] ?? 0)
              }
              groups.set(hash, group)
            }
            docs = [...groups.values()]
          } else {
            throw new Error(`unsupported stage ${JSON.stringify(stage)}`)
          }
        }
        return docs
      },
    }),
  }

  return store
}

