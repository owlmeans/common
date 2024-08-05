import type { Resource, ResourceRecord } from '@owlmeans/resource'
import type { BasicConfig, BasicContext } from '@owlmeans/context'

export interface StaticResourceAppend {
  getStaticResource: <T extends ResourceRecord>(alias?: string) => Resource<T>
}

export interface Config extends BasicConfig {}

export interface Context<C extends Config = Config> extends BasicContext<C> {}
