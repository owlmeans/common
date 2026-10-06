import { MONGO_DUPLICATE_KEY, mongoCriteriaHelper } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { Document } from 'mongodb'
import type { NativeUtils } from './native/types.js'

export const createNativeUtils = (): NativeUtils => {
  const idFilter = <T extends ResourceRecord>(resource: MongoResource<T>, id: string): Document =>
    mongoCriteriaHelper.criteriaToFilter({ id }, new Map(resource.references().map(ref => [ref.field, ref])))

  const isDuplicateKey = (error: unknown): boolean =>
    (error as { code?: unknown } | null)?.code === MONGO_DUPLICATE_KEY

  return { idFilter, isDuplicateKey }
}

export const nativeUtils = createNativeUtils()
