
import type { LazyService } from '@owlmeans/context'
import type { FlowConfig, FlowModel, FlowProvider, FlowTransition } from '@owlmeans/flow'
import type { AbstractRequest } from '@owlmeans/module'
import type { ResolvedServiceRoute } from '@owlmeans/route'

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


export interface FlowClient {
  boot: (target: string | null, from?: string) => Promise<FlowClient>
  flow: () => FlowModel
  service: () => ResolvedServiceRoute
  proceed: (transiation: FlowTransition, req?: Partial<AbstractRequest>) => Promise<void>
}
