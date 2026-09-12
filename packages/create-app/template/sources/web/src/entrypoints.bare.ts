import { bindAll, bindScreen, entrypoints as baseEntrypoints, handler } from '@owlmeans/web-panel'
import { appEntrypoints as protocols } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { HomeScreen } from './screens/home.js'

/** Local browser bindings for shared API and screen protocols. */
export const appEntrypoints = [
  ...baseEntrypoints,
  ...bindAll(protocols.api),
  // BASE renders the shared layout; HOME is its default child.
  bindScreen(protocols.web.base, handler(MainLayout)),
  bindScreen(protocols.web.home, handler(HomeScreen)),
]
