import { MONGO_DUPLICATE_KEY, mongoCriteriaHelper } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { Criteria, ResourceRecord } from '@owlmeans/resource'
import type { Document } from 'mongodb'
import type { NativeUtils } from './native/types.js'

export const createNativeUtils = (): NativeUtils => {
  const filterOf = <T extends ResourceRecord>(resource: MongoResource<T>, criteria: Criteria<T>): Document =>
    mongoCriteriaHelper.criteriaToFilter(criteria, new Map(resource.references().map(ref => [ref.field, ref])))

  const idFilter = <T extends ResourceRecord>(resource: MongoResource<T>, id: string): Document =>
    filterOf(resource, { id } as Criteria<T>)

  const isDuplicateKey = (error: unknown): boolean =>
    (error as { code?: unknown } | null)?.code === MONGO_DUPLICATE_KEY

  return { filterOf, idFilter, isDuplicateKey }
}

export const nativeUtils = createNativeUtils()
