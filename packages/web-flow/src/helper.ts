import { useContext, useNavigate, useValue } from '@owlmeans/client'
import { createFlowModel } from '@owlmeans/client-flow'
import { useSearchParams } from 'react-router-dom'
import { QUERY_PARAM, SERVICE_PARAM } from './consts.js'

export const useFlow = () => {
  const context = useContext()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const client = useValue(async () => {
    return createFlowModel(context, nav).boot(params.get(SERVICE_PARAM))
  }, [params.get(QUERY_PARAM), params.get(SERVICE_PARAM)])

  return client
}
