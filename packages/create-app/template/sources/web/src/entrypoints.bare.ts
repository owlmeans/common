import { BASE, bind, entrypoint, entrypoints as baseEntrypoints, frontend, handler, HOME, route } from '@owlmeans/web-panel'
import { sharedEntrypoints } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { HomeScreen } from './screens/home.js'

// Backend protocol declarations are materialized locally so each can be called from the browser.
const entrypoints = [...baseEntrypoints, ...sharedEntrypoints.map(protocol => bind(protocol))]

// Frontend layout + screens. BASE renders the shared layout; HOME is its default child.
entrypoints.push(entrypoint(route(BASE, '/', frontend()), handler(MainLayout)))
entrypoints.push(entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen)))

export const appEntrypoints = entrypoints
