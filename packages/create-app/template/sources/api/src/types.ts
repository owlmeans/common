import type { AppConfig, AppContext } from '@owlmeans/server-app'
import type { StaticResourceAppend } from '@owlmeans/static-resource'

export interface Config extends AppConfig {}

export interface Context<C extends Config = Config> extends AppContext<C>, StaticResourceAppend {}
