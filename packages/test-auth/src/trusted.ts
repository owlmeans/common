import { appendContextual } from '@owlmeans/context'
import type { TrustedRecord } from '@owlmeans/auth-common'
import type { Criteria, FirstOptions, Resource } from '@owlmeans/resource'
import { UnsupportedArgumentError } from '@owlmeans/resource'

const TRUSTED_DEFAULT_ALIAS = 'TRUSTED'

/** The fields a `trust()` lookup keys on — the only index this map has. */
const SUPPORTED_FIELDS = ['id', 'name']

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
 *
 * A read takes an id or a single-field criteria over `id` or `name`. Anything
 * wider is refused rather than scanned: the mock holds a handful of fixtures
 * and a query it cannot answer exactly is a test reaching past its seam.
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

  /**
   * @throws {UnsupportedArgumentError} on criteria naming anything but one supported field.
   */
  const first = (idOrWhere: string | Criteria<TrustedRecord>): TrustedRecord | null => {
    if (typeof idOrWhere === 'string') {
      return store.get(idOrWhere) ?? null
    }

    const entries = Object.entries(idOrWhere).filter(([, value]) => value !== undefined)
    const [entry, ...rest] = entries
    if (entry == null || rest.length > 0
      || !SUPPORTED_FIELDS.includes(entry[0]) || typeof entry[1] !== 'string') {
      throw new UnsupportedArgumentError('test-auth:trusted:where')
    }
    const [field, value] = entry as [string, string]

    return field === 'id' ? store.get(value) ?? null : findByField(value, field)
  }

  const resource: Partial<Resource<TrustedRecord>> = {
    load: async (
      idOrWhere: string | Criteria<TrustedRecord>, _opts?: FirstOptions<TrustedRecord>
    ): Promise<TrustedRecord | null> => first(idOrWhere),

    save: async (record: Partial<TrustedRecord>) => {
      if (record.id == null) {
        throw new Error('@owlmeans/test-auth: cannot save TRUSTED record without id')
      }
      store.set(record.id, record as TrustedRecord)
      return record as TrustedRecord
    },

    create: async (record: Partial<TrustedRecord>) => {
      if (record.id == null) {
        throw new Error('@owlmeans/test-auth: cannot create TRUSTED record without id')
      }
      if (store.has(record.id)) {
        throw new Error(`@owlmeans/test-auth: TRUSTED record ${record.id} already exists`)
      }
      store.set(record.id, record as TrustedRecord)
      return record as TrustedRecord
    },

    get: () => notImplemented('get'),
    list: () => notImplemented('list'),
    count: () => notImplemented('count'),
    update: () => notImplemented('update'),
    delete: () => notImplemented('delete'),
    take: () => notImplemented('take'),
    purge: () => notImplemented('purge'),
  }

  return appendContextual<Resource<TrustedRecord>>(alias, resource)
}
