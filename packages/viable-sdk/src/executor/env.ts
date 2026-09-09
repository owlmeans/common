import {
  TARGET_API_BASE, TARGET_API_PORT, TARGET_WEB_PORT, TARGET_WORKER_PORT
} from '@owlmeans/viable-common'

import { readEnvFile, ROOT_ENV_FILE, webEnvFile } from '../project/env.js'

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

/** Keys the frontend build injects on its own, so they are never announced as extras. */
const FRONTEND_STANDARD_KEYS = new Set([
  'FRONTEND_PORT', 'FRONTEND_HOST', 'BACKEND_HOST', 'BACKEND_PORT', 'BACKEND_BASE_URL',
  'BASE_URL', 'FRONTEND_ENV_KEYS', 'SOURCEMAP',
])

/**
 * Runtime environment for the target's api and worker processes.
 *
 * Read at runtime, never baked into the bundle — the api resolves `DATABASE_URL`, `VALKEY_URL`
 * and the OIDC triple when it boots, which is why a configure push that lands after a build still
 * reaches it with nothing more than a restart.
 */
export const backendEnv = async (dir: string): Promise<Record<string, string>> => {
  // The ROOT `.env` alone. The web package's file is compiled into a bundle anybody can read, so
  // the two are never merged in either direction.
  const values = await readEnvFile(dir, ROOT_ENV_FILE)

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
  }
}

/**
 * Build-time environment for the target's browser bundle.
 *
 * DELIBERATE DIFFERENCE from the publisher: `BACKEND_PORT` names the WEB port, not the api's.
 * A slot serves the app and its `/api` from one hostname behind one TLS front door, so the
 * publisher can leave the port blank and let the scheme imply it. A local run has two processes
 * on two loopback ports, and the local server proxies `/api` precisely so the browser stays
 * same-origin — pointing the bundle at 3000 instead would make every call cross-origin and put
 * the target's CORS configuration in the path of a developer's first page load.
 *
 * Composed from the WEB package's own `.env` and never from the root one. The publisher has the
 * same boundary as an allow-list (`frontendEnvVars` / `frontendSecrets`); here it is the file
 * split, and it is what keeps `DATABASE_URL` and `OIDC_SECRET` out of a bundle every visitor
 * downloads.
 */
export const frontendEnv = async (dir: string): Promise<Record<string, string>> => {
  const values = await readEnvFile(dir, webEnvFile(dir))

  const env: Record<string, string> = {
    FRONTEND_PORT: `${TARGET_WEB_PORT}`,
    BACKEND_HOST: 'localhost',
    BACKEND_PORT: `${TARGET_WEB_PORT}`,
    BACKEND_BASE_URL: TARGET_API_BASE,
    BASE_URL: '/',
    ...values,
  }

  // What the target's bundler substitutes. A key absent from this list is not replaced at build
  // time and reaches the browser as `process.env.X` against an object that does not exist there.
  env.FRONTEND_ENV_KEYS = Object.keys(env)
    .filter(key => !FRONTEND_STANDARD_KEYS.has(key))
    .join(',')

  return env
}
