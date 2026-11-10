import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { StorageConfig } from '@owlmeans/storage-resource'
import type { FileStreamsConfigAppend } from './types.js'

export interface Config extends BasicConfig, FileStreamsConfigAppend {
  storageBuckets?: { [key: string]: StorageConfig }
}

export interface Context<C extends Config = Config> extends BasicContext<C> {}
