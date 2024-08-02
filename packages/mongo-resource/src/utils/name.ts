import type { DbConfig, ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '../types.js'

export const mongoCollectionName = (config: DbConfig, resource: MongoResource<ResourceRecord>): string =>
  `${config.resourcePrefix ?? ''}${resource.name ?? resource.alias}`
