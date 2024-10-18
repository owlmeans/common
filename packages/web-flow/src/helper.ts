import { useContext, useNavigate, useValue } from '@owlmeans/client'
import { createFlowClient } from '@owlmeans/client-flow'
import type { FlowClient } from '@owlmeans/client-flow'
import { useSearchParams } from 'react-router-dom'
import { QUERY_PARAM, SERVICE_PARAM } from './consts.js'

export const useFlow = (target: string | null = null): FlowClient | null => {
  const context = useContext()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const client = useValue(async () => {
    return createFlowClient(context, nav).boot(params.get(SERVICE_PARAM) ?? target)
  }, [params.get(QUERY_PARAM), params.get(SERVICE_PARAM) ?? target])

  return client
}
