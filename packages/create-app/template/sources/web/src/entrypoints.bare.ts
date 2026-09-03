import { BASE, entrypoint, entrypoints as baseEntrypoints, frontend, handler, HOME, route } from '@owlmeans/web-panel'
import { sharedEntrypoints } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { HomeScreen } from './screens/home.js'

// Backend entrypoints arrive as declarations only — `elevate(entrypoints, alias)` (from
// '@owlmeans/web-panel') makes one callable here without giving it a component.
const entrypoints = [...baseEntrypoints, ...sharedEntrypoints]

// Frontend layout + screens. BASE renders the shared layout; HOME is its default child.
entrypoints.push(entrypoint(route(BASE, '/', frontend()), handler(MainLayout)))
entrypoints.push(entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HomeScreen)))

export const appEntrypoints = entrypoints
