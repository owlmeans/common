import { bindAll, bindScreen, entrypoints as baseEntrypoints, handler } from '@owlmeans/web-panel'
import { appProtocols } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { HomeScreen } from './screens/home.js'

/** Local browser bindings for shared API and screen protocols. */
export const appBindings = [
  ...baseEntrypoints,
  ...bindAll(appProtocols.api),
  // BASE renders the shared layout; HOME is its default child.
  bindScreen(appProtocols.web.base, handler(MainLayout)),
  bindScreen(appProtocols.web.home, handler(HomeScreen)),
]
