
import type { LazyService } from '@owlmeans/context'
import type { FlowConfig, FlowModel, FlowProvider } from '@owlmeans/flow'
import type { AbstractRequest } from '@owlmeans/module'

export interface FlowService extends LazyService {
  supplied: Promise<boolean>

  flow: FlowModel | null

  state: () => Promise<FlowModel | null>

  resolvePair: () => ResolvePair

  config: () => FlowConfig

  begin: (slug?: string, from?: string) => Promise<FlowModel>

  provideFlow: FlowProvider

  proceed: (req?: Partial<AbstractRequest>) => Promise<void>
}

export interface ResolvePair {
  resolve: (val: boolean) => void,
  reject: (err: Error) => void
}
