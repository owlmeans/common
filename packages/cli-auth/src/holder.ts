import { hostname, userInfo } from 'node:os'
import { OAuthAccessDenied, OAuthError, OAUTH_DEVICE_NAME_MAX, signInRequired, TokenRejected, type AuthorizationServerMetadata, type DeviceSignInOutcome, oauthClientHelper } from '@owlmeans/oauth'
import { DEFAULT_WAIT_MS } from './consts.js'
import { envFileHelper } from './env-file.js'
import { lockPathFor, makeSignInLockHelper } from './lock.js'
import type { SignInLockInfo, CliCredentials, CliCredentialsOptions } from './types.js'
import { openBrowser } from './open-browser.js'


const defaultDeviceName = (): string => {
  let who = 'cli'
  try {
    who = userInfo().username
  } catch {
    // Some sandboxes have no passwd entry for the running uid; the hostname alone still helps.
  }

  return `${hostname()} · ${who}`.slice(0, OAUTH_DEVICE_NAME_MAX)
}

/** One in-flight sign-in per API URL, per process — a second `require()` call while the first is
 * still waiting joins the SAME poll rather than requesting a second device code. */
const inFlightByApiUrl = new Map<string, Promise<DeviceSignInOutcome>>()

export const makeCliCredentials = (opts: CliCredentialsOptions): CliCredentials => {
  const env = opts.env ?? process.env
  const notify = (message: string): void => opts.onNotify?.(message)
  const credentialsPath = envFileHelper.resolveEnvFile(env)
  const lock = makeSignInLockHelper(lockPathFor(credentialsPath))

  const token = async (): Promise<string | null> => {
    const envValue = env[opts.tokenEnvKey]
    if (envValue != null && envValue !== '') return envValue

    const file = await envFileHelper.readCredentialsFile(env)
    const boundUrl = file[opts.apiUrlEnvKey]
    if (boundUrl != null && boundUrl !== '' && boundUrl !== opts.apiUrl) return null

    const fileToken = file[opts.tokenEnvKey]

    return fileToken != null && fileToken !== '' ? fileToken : null
  }

  /** Start a fresh device authorization, or adopt another live process's own — either way, claim
   * or join the lock BEFORE requesting one, so the decision and the request agree. */
  const claimJoinOrStart = async (server: AuthorizationServerMetadata): Promise<{ owner: boolean, info: SignInLockInfo }> => {
    const authorization = await oauthClientHelper.requestDeviceAuthorization(server, {
      client_id: opts.clientId, scope: opts.scope, resource: opts.resource ?? opts.apiUrl,
      device_name: opts.deviceName ?? defaultDeviceName(),
    })

    return await lock.claimOrJoinLock(opts.apiUrl, {
      verificationUri: authorization.verification_uri,
      verificationUriComplete: authorization.verification_uri_complete,
      userCode: authorization.user_code,
      deviceCode: authorization.device_code,
      interval: authorization.interval,
      expiresAt: Date.now() + authorization.expires_in * 1000,
    })
  }

  /**
   * Synchronous on purpose, up to the point it records itself in `inFlightByApiUrl` — that is
   * what makes two `require()` calls racing in the SAME process converge on one sign-in rather
   * than each starting its own before either has had a chance to publish that it is working on
   * it. (Cross-PROCESS concurrency is what the file lock inside `claimJoinOrStart` is for.)
   */
  const beginOrJoin = (): Promise<DeviceSignInOutcome> => {
    const existing = inFlightByApiUrl.get(opts.apiUrl)
    if (existing != null) return existing

    const promise = (async (): Promise<DeviceSignInOutcome> => {
      const server = await oauthClientHelper.discoverAuthorizationServer(opts.apiUrl)
      const claim = await claimJoinOrStart(server)

      notify(
        claim.info.userCode != null
          ? `Sign in at ${claim.info.verificationUri} with code ${claim.info.userCode}`
          : `Sign in at ${claim.info.verificationUri}`
      )
      // Only the owner opens a browser — a joining process's own (unused) device authorization is
      // simply left to expire, since a second, un-displayed code would only teach the server's
      // rate limiter that this client polls too eagerly.
      if (claim.owner) {
        openBrowser(claim.info.verificationUriComplete ?? claim.info.verificationUri)
      }

      try {
        const outcome = await oauthClientHelper.pollDeviceToken(server, {
          clientId: opts.clientId, deviceCode: claim.info.deviceCode, interval: claim.info.interval,
          expiresAt: claim.info.expiresAt,
        })
        if (outcome.status === 'authorized') {
          await envFileHelper.setEnvValues(credentialsPath, { [opts.tokenEnvKey]: outcome.token, [opts.apiUrlEnvKey]: opts.apiUrl })
          notify('Signed in.')
        }

        return outcome
      } finally {
        inFlightByApiUrl.delete(opts.apiUrl)
        if (claim.owner) await lock.releaseLock(claim.info.nonce)
      }
    })()
    inFlightByApiUrl.set(opts.apiUrl, promise)

    return promise
  }

  return {
    token,

    require: async (waitMs = DEFAULT_WAIT_MS): Promise<string> => {
      const existing = await token()
      if (existing != null) return existing

      // Deliberately NOT awaited here — `beginOrJoin()` is the pending sign-in itself, and
      // racing it (rather than awaiting it first) is what lets `require()` return control to
      // its caller after `waitMs` while the sign-in keeps running toward its own resolution.
      const pollPromise = beginOrJoin()
      // The ceiling's timer is cleared once the race is decided: a pending timer keeps a process
      // alive, and `viable-mcp login` (waiting up to 15 minutes) must exit the moment it is signed in.
      let ceiling: ReturnType<typeof setTimeout> | undefined
      const raced = await Promise.race([
        pollPromise.then(outcome => ({ settled: true as const, outcome })),
        new Promise<{ settled: false }>(resolve => {
          ceiling = setTimeout(() => resolve({ settled: false }), waitMs)
        }),
      ]).finally(() => clearTimeout(ceiling))

      if (!raced.settled) {
        const pending = await lock.readLock()
        throw signInRequired({
          url: pending?.verificationUri ?? opts.apiUrl, code: pending?.userCode, expiresAt: pending?.expiresAt,
        })
      }

      switch (raced.outcome.status) {
        case 'authorized':
          return raced.outcome.token
        case 'denied':
          throw new OAuthAccessDenied('sign-in')
        case 'expired':
          throw new OAuthError('sign-in:expired')
        default:
          throw new OAuthError('sign-in:aborted')
      }
    },

    invalidate: async (rejectedToken: string): Promise<void> => {
      const file = await envFileHelper.readCredentialsFile(env)
      if (file[opts.tokenEnvKey] === rejectedToken) {
        await envFileHelper.setEnvValues(credentialsPath, { [opts.tokenEnvKey]: undefined })
        notify('The stored token was refused. Signing in again.')

        return
      }
      if (env[opts.tokenEnvKey] === rejectedToken) {
        throw new TokenRejected(opts.tokenEnvKey)
      }
    },

    signOut: async (): Promise<void> => {
      const current = await token()
      if (current == null) return

      const server = await oauthClientHelper.discoverAuthorizationServer(opts.apiUrl).catch(() => null)
      if (server != null) {
        await oauthClientHelper.revokeToken(server, { token: current, clientId: opts.clientId }).catch(() => undefined)
      }
      await envFileHelper.setEnvValues(credentialsPath, { [opts.tokenEnvKey]: undefined })
    },
  }
}
