import path from 'node:path'

import {
  MAIN_APP, TARGET_API_BASE, TARGET_API_PORT, TARGET_WEB_PORT, TARGET_WORKER_PORT, appMapHelper,
  type SlotAppClaim,
} from '@owlmeans/viable-common'

import { makeProjectEnvHelper } from '../project/env.js'
import { makeLayoutHelper } from './layout.js'
import { ROOT_ENV_FILE } from '../project/consts.js'
import { FRONTEND_STANDARD_KEYS } from './consts.local.js'
import type { TargetEnvHelper } from './env/types.js'

/**
 * The environment a locally-run target sees.
 *
 * Same tables the publisher composes for a pod, with two differences that follow from where this
 * runs. The hosts are `localhost` — a loopback address, not a claimed preview hostname — and the
 * VALUES come from the target's own `.env` files rather than from slot metadata, because on a
 * developer's machine the platform provisions nothing: the database URL, the queue URL and the
 * OIDC identity are lines in a file the developer and the configure push both write.
 *
 * The defaults are laid down first and the `.env` is overlaid on top, so a user who set a value
 * gets the value they set. Callers that own a port — the boot check, the worker — spread their
 * override over the result, exactly as the publisher does.
 */
export const makeTargetEnvHelper = (dir: string): TargetEnvHelper => {
  const projectEnv = makeProjectEnvHelper(dir)

  const isMain = (app?: SlotAppClaim): boolean => app == null || app.name === MAIN_APP

  const backendEnv = async (app?: SlotAppClaim): Promise<Record<string, string>> => {
    // The ROOT `.env` alone. The web package's file is compiled into a bundle anybody can read, so
    // the two are never merged in either direction.
    const values = await projectEnv.readEnvFile(ROOT_ENV_FILE)

    return {
      BACKEND_PORT: `${TARGET_API_PORT}`,
      BACKEND_HOST: 'localhost',
      BACKEND_BASE_URL: TARGET_API_BASE,
      FRONTEND_HOST: 'localhost',
      FRONTEND_PORT: `${TARGET_WEB_PORT}`,
      BASE_URL: '',
      WORKER_PORT: `${TARGET_WORKER_PORT}`,
      // The target's own values last: everything above is a default this machine can state without
      // asking, and everything the user or a configure push wrote outranks it.
      ...values,
      // Another app's api binds its own port under its own mount — the root file describes main's.
      ...(isMain(app) ? {} : appMapHelper.apiEnvOf(app!)),
    }
  }

  const frontendEnv = async (app?: SlotAppClaim): Promise<Record<string, string>> => {
    const main = isMain(app)
    // main's file is the web package's own; another app's is its own web package's, beside it.
    const file = main
      ? projectEnv.webEnvFile()
      : path.relative(dir, path.join(makeLayoutHelper(dir).webPath(app!.name), ROOT_ENV_FILE))
    const values = await projectEnv.readEnvFile(file)
    const mounted = main ? null : appMapHelper.webEnvOf(app!)

    const env: Record<string, string> = {
      APP_UNSECURE: 'true',
      FRONTEND_PORT: `${TARGET_WEB_PORT}`,
      BACKEND_HOST: 'localhost',
      BACKEND_PORT: `${TARGET_WEB_PORT}`,
      BACKEND_BASE_URL: mounted?.BACKEND_BASE_URL ?? TARGET_API_BASE,
      BASE_URL: mounted?.BASE_URL ?? '/',
      ...values,
    }

    // What the target's bundler substitutes. A key absent from this list is not replaced at build
    // time and reaches the browser as `process.env.X` against an object that does not exist there.
    env.FRONTEND_ENV_KEYS = Object.keys(env)
      .filter(key => !FRONTEND_STANDARD_KEYS.has(key))
      .join(',')

    return env
  }

  return { backendEnv, frontendEnv }
}
