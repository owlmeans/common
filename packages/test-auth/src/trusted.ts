import { appendContextual } from '@owlmeans/context'
import type { TrustedRecord } from '@owlmeans/auth-common'
import type { Resource } from '@owlmeans/resource'

const TRUSTED_DEFAULT_ALIAS = 'TRUSTED'

const notImplemented = (op: string): never => {
  throw new Error(`@owlmeans/test-auth: in-memory TRUSTED resource does not implement ${op}()`)
}

const getter = (record: TrustedRecord, field: string): unknown =>
  (record as unknown as Record<string, unknown>)[field]

/**
 * In-memory `Resource<TrustedRecord>` used to satisfy `trust()` lookups
 * (`@owlmeans/auth-common/utils/trusted.ts`). Pre-populate with the
 * trusted users your code under test expects to find.
 *
 * Only `load`, `save` and `create` are implemented — that covers the
 * `trust()` boundary plus straightforward seeding from tests. Other
 * operations throw, so tests that need them have to be honest about
 * adding integration coverage instead of leaning on the mock.
 */
export const makeMemoryTrustedResource = (
  records: TrustedRecord[] = [],
  alias: string = TRUSTED_DEFAULT_ALIAS
): Resource<TrustedRecord> => {
  const store = new Map<string, TrustedRecord>()
  for (const r of records) {
    if (r.id == null) {
      throw new Error('@owlmeans/test-auth: TRUSTED record without id')
    }
    store.set(r.id, r)
  }

  const findByField = (value: string, field: string): TrustedRecord | null => {
    for (const record of store.values()) {
      if (getter(record, field) === value) return record
    }
    return null
  }

  const resource: Partial<Resource<TrustedRecord>> = {
    load: async <Type extends TrustedRecord>(id: string, field?: unknown) => {
      const fieldName = typeof field === 'string'
        ? field
        : (field as { field?: string } | undefined)?.field
      if (fieldName != null && fieldName !== 'id') {
        return (findByField(id, fieldName) as Type | null) ?? null
      }
      return (store.get(id) as Type | undefined) ?? null
    },

    save: async <Type extends TrustedRecord>(record: Partial<Type>) => {
      if (record.id == null) {
        throw new Error('@owlmeans/test-auth: cannot save TRUSTED record without id')
      }
      store.set(record.id, record as TrustedRecord)
      return record as Type
    },

    create: async <Type extends TrustedRecord>(record: Partial<Type>) => {
      if (record.id == null) {
        throw new Error('@owlmeans/test-auth: cannot create TRUSTED record without id')
      }
      if (store.has(record.id)) {
        throw new Error(`@owlmeans/test-auth: TRUSTED record ${record.id} already exists`)
      }
      store.set(record.id, record as TrustedRecord)
      return record as Type
    },

    get: () => notImplemented('get'),
    list: () => notImplemented('list'),
    update: () => notImplemented('update'),
    delete: () => notImplemented('delete'),
    pick: () => notImplemented('pick'),
  }

  return appendContextual<Resource<TrustedRecord>>(alias, resource)
}
