import type { UploadSessionProtocol } from './protocols/types.js'

/**
 * The session parameter a protocol of a `makeUploadProtocols` tree was declared with — read from its
 * own route path (`/:project/file` → `project`), so a server and a client never configure it twice.
 */
export const uploadSessionParamOf = (protocol: UploadSessionProtocol): string => {
  const first = protocol.route.route.path.split('/').find(segment => segment !== '')
  if (first == null || !first.startsWith(':')) {
    throw new SyntaxError(`upload: ${protocol.alias} is not a session route of an upload tree`)
  }

  return first.slice(1)
}
