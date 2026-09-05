
export enum EntrypointOutcome {
  Ok = 'ok',
  Accepted = 'accepted',
  Created = 'created',
  Finished = 'finished'
}

/**
 * Service alias a transport registers under. The default protocol is the web one, so an application
 * that binds nothing keeps talking HTTP.
 */
export const transportAlias = (protocol: string = 'http') => `transport:${protocol}`
