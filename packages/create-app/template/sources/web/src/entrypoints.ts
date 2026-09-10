import { bindAll, bindScreen, entrypoints as baseEntrypoints, handler } from '@owlmeans/web-panel'
import { session, web } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { AboutScreen } from './screens/about.js'
import { HomeScreen } from './screens/home.js'
import { SessionScreen } from './screens/session.js'

const entrypoints = [...baseEntrypoints, ...bindAll(session)]

// Frontend protocol declarations bind to renderers in the web project.
entrypoints.push(bindScreen(web.base, handler(MainLayout)))
entrypoints.push(bindScreen(web.home, handler(HomeScreen)))
entrypoints.push(bindScreen(web.session, handler(SessionScreen)))
entrypoints.push(bindScreen(web.about, handler(AboutScreen)))

export const appEntrypoints = entrypoints
