import { BASE, elevate, entrypoint, entrypoints as baseEntrypoints, frontend, handler, HOME, route } from '@owlmeans/web-panel'
import { session, sessionEntrypoints, web } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { AboutScreen } from './screens/about.js'
import { HomeScreen } from './screens/home.js'
import { SessionScreen } from './screens/session.js'

const entrypoints = [...baseEntrypoints, ...sessionEntrypoints]

// Backend entrypoints — elevated without a component so the client can call them.
elevate(entrypoints, session.base)
elevate(entrypoints, session.list)
elevate(entrypoints, session.add)
elevate(entrypoints, session.remove)

// Frontend layout + screens. BASE renders the shared layout; HOME is its default child.
entrypoints.push(entrypoint(route(BASE, '/', frontend()), handler(MainLayout)))
entrypoints.push(entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen)))
entrypoints.push(entrypoint(route(web.session, '/session', frontend({ parent: BASE })), handler(SessionScreen)))
entrypoints.push(entrypoint(route(web.about, '/about', frontend({ parent: BASE })), handler(AboutScreen)))

export const appEntrypoints = entrypoints
