import { ed25519Plugin } from './ed25519.js'
import { KeyPlugin } from './types.js'

export const plugins: Record<string, KeyPlugin> = {}

plugins[ed25519Plugin.type] = ed25519Plugin
