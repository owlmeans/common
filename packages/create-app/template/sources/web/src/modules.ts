import { BASE, elevate, entrypoint, frontend, handler, HOME, modules as baseModules, route } from '@owlmeans/web-panel'
import { session, sessionModules, web } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { AboutScreen } from './screens/about.js'
import { HomeScreen } from './screens/home.js'
import { SessionScreen } from './screens/session.js'

const modules = [...baseModules, ...sessionModules]

// Backend entrypoints — elevated without a component so the client can call them.
elevate(modules, session.base)
elevate(modules, session.list)
elevate(modules, session.add)
elevate(modules, session.remove)

// Frontend layout + screens. BASE renders the shared layout; HOME is its default child.
modules.push(entrypoint(route(BASE, '/', frontend()), handler(MainLayout)))
modules.push(entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen)))
modules.push(entrypoint(route(web.session, '/session', frontend({ parent: BASE })), handler(SessionScreen)))
modules.push(entrypoint(route(web.about, '/about', frontend({ parent: BASE })), handler(AboutScreen)))

export const appModules = modules
