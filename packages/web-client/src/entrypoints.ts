import { DISPATCHER, DISPATCHER_SURROGATE } from '@owlmeans/auth'
import { entrypoints as list } from '@owlmeans/client-auth'
import { elevate } from '@owlmeans/client-entrypoint'
import { handler } from '@owlmeans/client'
import { Dispatcher } from './components/dispatcher/component.js'
import { SurrogateScreen } from './login/screen.js'

elevate(list, DISPATCHER, handler(Dispatcher))

/**
 * Elevated here rather than in a relying-party package on purpose.
 *
 * The surrogate mechanic is not OIDC-specific — it is "run the login route one window up and hand
 * the result back" — and every web application already spreads this list. Putting the screen here
 * means `web-panel`, `mui-panel` and every generated target gain a working login window with no
 * edit of their own, which is the only way an application that is already deployed can get it.
 */
elevate(list, DISPATCHER_SURROGATE, handler(SurrogateScreen))

export const entrypoints = list
