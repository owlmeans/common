import type { DbConfig, ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '../types.js'
import { VALID_COLLECTION_NAME } from './consts.local.js'

export const mongoCollectionName = (config: DbConfig, resource: MongoResource<ResourceRecord>): string => {
  const name = `${config.resourcePrefix ?? ''}${resource.name ?? resource.alias}`
  if (!VALID_COLLECTION_NAME.test(name)) {
    throw new SyntaxError(
      `Invalid mongo collection name "${name}" (alias: "${resource.alias}"): only [a-zA-Z0-9_-] are allowed`
    )
  }
  return name
}
