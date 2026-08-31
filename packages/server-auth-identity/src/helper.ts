import type { BasicContext } from '@owlmeans/context'
import { makeIdentityAccountResource, makeIdentityProfileResource, makeIdentityCredentialsResource, makeOrgEntityResource } from './resource.js'
import { makeIdentityLinkingService } from './service.js'
import { makeEntityResolverService } from './resolver.js'

export const appendAuthIdentityResources = (
  context: BasicContext<any>,
  dbAlias?: string
): void => {
  context.registerResource(makeIdentityAccountResource(dbAlias))
  context.registerResource(makeIdentityProfileResource(dbAlias))
  context.registerResource(makeIdentityCredentialsResource(dbAlias))
  context.registerResource(makeOrgEntityResource(dbAlias))
  context.registerService(makeIdentityLinkingService())
  // Registering the resolver is what tells the server boundary that this deployment HAS
  // organizations: without it `request.entity` stays undefined and every consumer falls back to
  // treating the token's slug as the only entity value there is.
  context.registerService(makeEntityResolverService())
}
