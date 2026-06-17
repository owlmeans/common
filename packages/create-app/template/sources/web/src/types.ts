import type { AppConfig, AppContext } from '@owlmeans/web-panel'

export interface Config extends AppConfig {}

export interface Context<C extends Config = Config> extends AppContext<C> {}
