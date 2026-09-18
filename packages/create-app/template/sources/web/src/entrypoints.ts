import { bindAll, bindScreen, entrypoints as baseEntrypoints, handler } from '@owlmeans/web-panel'
import { appProtocols } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { AboutScreen } from './screens/about.js'
import { HomeScreen } from './screens/home.js'
import { SessionScreen } from './screens/session.js'

/** Local browser bindings for shared API and screen protocols. */
export const appBindings = [
  ...baseEntrypoints,
  ...bindAll(appProtocols.api),
  bindScreen(appProtocols.web.base, handler(MainLayout)),
  bindScreen(appProtocols.web.home, handler(HomeScreen)),
  bindScreen(appProtocols.web.session, handler(SessionScreen)),
  bindScreen(appProtocols.web.about, handler(AboutScreen)),
]
