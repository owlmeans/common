import {
  BASE, bindAll, bindScreen, entrypoints as baseEntrypoints, frontend, handler, HOME, route,
} from '@owlmeans/web-panel'
import { openProtocol } from '@owlmeans/entrypoint'
import { sharedEntrypoints } from '__APP_SLUG__-common'
import { MainLayout } from './layout/main.js'
import { HomeScreen } from './screens/home.js'

// Backend protocol declarations are materialized locally so each can be called from the browser.
const entrypoints = [...baseEntrypoints, ...bindAll(sharedEntrypoints)]

// Frontend layout + screens. BASE renders the shared layout; HOME is its default child.
const base = openProtocol(route(BASE, '/', frontend()))
const home = openProtocol(route(HOME, '/', frontend({ default: true, parent: base })))
entrypoints.push(bindScreen(base, handler(MainLayout)))
entrypoints.push(bindScreen(home, handler(HomeScreen)))

export const appEntrypoints = entrypoints
