
import { plugins as basicPlugins } from '@owlmeans/basic-keys'
import { ed25519owlPluginBuilder } from './ed25519owl.js'

const owlPluginInstance = ed25519owlPluginBuilder()

basicPlugins[owlPluginInstance.type] = owlPluginInstance

export const plugins = basicPlugins
