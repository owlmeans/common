import type { DbConfig, ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '../types.js'

// Collection names must use only alphanumeric characters, underscore, and hyphen — no
// colons or other delimiters. This guard enforces the rule for every collection created
// through makeMongoResource across all projects (common/internal/app), failing fast at
// initialization rather than silently creating a badly-named collection.
const VALID_COLLECTION_NAME = /^[a-zA-Z0-9_-]+$/

export const mongoCollectionName = (config: DbConfig, resource: MongoResource<ResourceRecord>): string => {
  const name = `${config.resourcePrefix ?? ''}${resource.name ?? resource.alias}`
  if (!VALID_COLLECTION_NAME.test(name)) {
    throw new SyntaxError(
      `Invalid mongo collection name "${name}" (alias: "${resource.alias}"): only [a-zA-Z0-9_-] are allowed`
    )
  }
  return name
}
