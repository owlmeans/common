import type { BasicContext } from '@owlmeans/context'
import { makeIdentityAccountResource, makeIdentityProfileResource, makeIdentityCredentialsResource } from './resource.js'
import { makeIdentityLinkingService } from './service.js'

export const appendAuthIdentityResources = (
  context: BasicContext<any>,
  dbAlias?: string
): void => {
  context.registerResource(makeIdentityAccountResource(dbAlias))
  context.registerResource(makeIdentityProfileResource(dbAlias))
  context.registerResource(makeIdentityCredentialsResource(dbAlias))
  context.registerService(makeIdentityLinkingService())
}
