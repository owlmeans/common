import { bindAll, bindScreen, entrypoints as baseEntrypoints, handler } from '@owlmeans/web-panel'
import { appEntrypoints as protocols } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { AboutScreen } from './screens/about.js'
import { HomeScreen } from './screens/home.js'
import { SessionScreen } from './screens/session.js'

/** Local browser bindings for shared API and screen protocols. */
export const appEntrypoints = [
  ...baseEntrypoints,
  ...bindAll(protocols.api),
  bindScreen(protocols.web.base, handler(MainLayout)),
  bindScreen(protocols.web.home, handler(HomeScreen)),
  bindScreen(protocols.web.session, handler(SessionScreen)),
  bindScreen(protocols.web.about, handler(AboutScreen)),
]
