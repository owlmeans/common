import { MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import type { Middleware } from '@owlmeans/context'

import { DEFAULT_ALIAS } from './consts.js'
import type { PostgresService } from './types.js'

/**
 * Run the work resources held back until every one of them had initialized.
 *
 * Foreign keys are the reason this exists: a key points at a table another resource owns,
 * and resource initialization order is registration order, not dependency order. The
 * Loading stage of the Context middleware type runs immediately after the last resource's
 * `init()` — the first moment at which every table is known to exist.
 */
export const drainMiddleware = (alias: string = DEFAULT_ALIAS): Middleware => ({
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,

  apply: async context => {
    if (!context.hasService(alias)) {
      return
    }

    await context.service<PostgresService>(alias).drain()
  }
})
