import { openProtocol } from '@owlmeans/entrypoint'
import { BASE, HOME } from '@owlmeans/context'
import { frontend, route } from '@owlmeans/route'

const webBase = openProtocol(route(BASE, '/', frontend()))

/** The shared immutable protocol tree. Add API declarations below `api` as the shell grows. */
export const appProtocols = {
  api: {},
  web: {
    base: webBase,
    home: openProtocol(route(HOME, '/', frontend({ default: true, parent: webBase }))),
  },
}
