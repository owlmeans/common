import type { AbstractResponse } from '@owlmeans/entrypoint'
import type { AxiosResponse } from 'axios'
import type { ApiClientError } from '../../errors.js'

/** Turns an axios answer into the entrypoint reply: a resolved value or a typed failure. */
export interface ResponseUtils {
  /** Resolves `reply` with a 2xx answer's value, or rejects it with the failure of any other status. */
  processResponse: (response: AxiosResponse, reply: AbstractResponse<any>) => void
  /**
   * The typed error of a bare status: `ServerCrashedError` (500), `ServerAuthError` (401),
   * `ApiClientError('forbidden[:<id>]')` (403), `ApiStatusError` (`api:client:status:<n>[:<id>]`)
   * for every other one.
   */
  statusError: (status: number, incidentId?: string) => ApiClientError
}
