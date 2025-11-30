import { useContext, useModule, useNavigate, useValue } from '@owlmeans/client'
import { createFlowClient } from '@owlmeans/client-flow'
import type { FlowClient, FlowService } from '@owlmeans/client-flow'
import { DEFAULT_ALIAS as FLOW_ALIAS } from '@owlmeans/client-flow'
import { useSearchParams } from 'react-router'
import { QUERY_PARAM, SERVICE_PARAM } from './consts.js'

export const useFlow = (target: string | null = null): FlowClient | null => {
  const context = useContext()
  const nav = useNavigate()
  const [query] = useSearchParams()
  const { params } = useModule()
  const client = useValue(async () => {
    if (QUERY_PARAM in params && params[QUERY_PARAM] != null) {
      const service = context.service<FlowService>(FLOW_ALIAS)
      await service.ready()
      
      return createFlowClient(context, nav).setup(await service.load(params[QUERY_PARAM] as string))
    }
    return createFlowClient(context, nav).boot(query.get(SERVICE_PARAM) ?? target)
  }, [
    QUERY_PARAM in params && params[QUERY_PARAM] as string,
    query.get(QUERY_PARAM), query.get(SERVICE_PARAM) ?? target
  ])

  return client
}
