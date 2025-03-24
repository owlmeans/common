import type { KeyPlugin } from './types.js'
import { ed25519Plugin } from './ed25519.js'
import { xChahaPlugin } from './xchacha.js'

export const plugins: Record<string, KeyPlugin> = {}

plugins[ed25519Plugin.type] = ed25519Plugin
plugins[xChahaPlugin.type] = xChahaPlugin
