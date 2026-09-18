import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Page } from 'playwright'
import type { Auth, AuthCredentials, AuthRole } from '@owlmeans/auth'
import {
  AuthroizationType, AuthRole as Role, AuthenticationType, buildSupervisorPayload
} from '@owlmeans/auth'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { createIdOfLength } from '@owlmeans/basic-ids'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { makeBearer } from '@owlmeans/test-auth'

export interface PregenerateAuthTokenOptions {
  /** Target user id / email the token represents. */
  userId: string
  /**
   * Private key to sign the bearer with, e.g. `ed25519:<base64>` from
   * `.env.dev.secrets`. MUST be the key the target backend trusts as its own
   * signing key (it verifies bearers against `cfg.alias`/`cfg.service`).
   */
  pk: string
  scopes?: string[]
  role?: AuthRole
  entityId?: string
  profileId?: string
  /** `source` recorded in the Auth payload (usually the backend service alias). */
  source?: string
}

/**
 * Mint a ready-to-use `ED25519-BASIC-TOKEN ...` bearer offline, reusing
 * `@owlmeans/test-auth`'s `makeBearer`. This is the "set a token directly"
 * fast-path for e2e/integration tests: no UI, no live auth round-trip. The
 * backend accepts it because it is signed by the project's own trusted key.
 *
 * For a faithful end-to-end login (real supervisor plugin + registration), drive
 * {@link loginViaSupervisorForm} instead.
 */
export const pregenerateAuthToken = async (opts: PregenerateAuthTokenOptions): Promise<string> => {
  const auth: Auth = {
    token: createIdOfLength(32),
    userId: opts.userId,
    profileId: opts.profileId ?? opts.userId,
    entitySlug: opts.entityId,
    scopes: opts.scopes ?? ['*'],
    role: opts.role ?? Role.User,
    type: AuthroizationType.Ed25519BasicToken,
    source: opts.source ?? '',
    isUser: true,
    createdAt: new Date()
  }

  return makeBearer(auth, makeKeyPairModel(opts.pk))
}

/**
 * Inject a pre-generated bearer into an app that uses the standard owlmeans
 * dispatcher: navigate to `/dispatcher?token=...` so the web app authenticates
 * and redirects home natively. Note: apps that override the DISPATCHER route
 * (e.g. to force an external IdP) should use {@link loginViaSupervisorForm}.
 */
export const loginViaDispatcher = async (
  page: Page, baseUrl: string, token: string,
  opts?: { dispatcherPath?: string, waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle' }
): Promise<void> => {
  const path = opts?.dispatcherPath ?? '/dispatcher'
  const url = new URL(path, baseUrl)
  url.searchParams.set('token', token)
  // `domcontentloaded`, not playwright's `load` default — see the note on `MountOptions.waitUntil`.
  await page.goto(url.toString(), { waitUntil: opts?.waitUntil ?? 'domcontentloaded' })
  // Wait until the dispatcher has navigated away (token consumed).
  await page.waitForURL(u => !u.pathname.startsWith(path), { timeout: 30_000 })
}

export interface SupervisorApiAuthOptions {
  /** Auth-manager API base URL (the backend serving /authentication/* and /authenticate). */
  apiBaseUrl: string
  /** Target user id / email to authenticate (and register on first use). */
  userId: string
  /** Supervisor private key, e.g. `ed25519:<base64>` from `.env.dev.secrets`. */
  pk: string
  /** Paths, overridable for non-default routing. */
  paths?: { init?: string, authenticate?: string, dispatch?: string }
  fetchImpl?: typeof fetch
}

const postJson = async (
  fetchImpl: typeof fetch, url: string, body: unknown
): Promise<any> => {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`supervisor api ${url} -> ${res.status} ${await res.text().catch(() => '')}`)
  }
  return res.json()
}

/**
 * Pregenerate a real bearer by driving the live PK-based supervisor flow over the
 * backend API (no browser): `/authentication/init` -> sign the challenge with the
 * supervisor key -> `/authentication/authenticate` -> `/authenticate` (dispatcher
 * exchange). This is the faithful "set a token directly via API" path
 * (registers the user on first use), independent of any front-end routing.
 *
 * Returns the final `ED25519-BASIC-TOKEN ...` bearer the backend accepts.
 */
export const authenticateViaSupervisorApi = async (
  opts: SupervisorApiAuthOptions
): Promise<string> => {
  const fetchImpl = opts.fetchImpl ?? fetch
  const base = opts.apiBaseUrl.replace(/\/$/, '')
  const initPath = opts.paths?.init ?? '/authentication/init'
  const authPath = opts.paths?.authenticate ?? '/authentication/authenticate'
  const dispatchPath = opts.paths?.dispatch ?? '/authenticate'

  // 1. Ask the auth manager for a fresh, signed challenge envelope.
  const { challenge } = await postJson(fetchImpl, base + initPath, {
    type: AuthenticationType.Supervisor
  }) as { challenge: string }

  // 2. Sign the unwrapped challenge + userId + salt with the supervisor key.
  const challengeMsg = makeEnvelopeModel<string>(challenge, EnvelopeKind.Wrap).message()
  const salt = createIdOfLength(16)
  const signature = await makeKeyPairModel(opts.pk)
    .sign(buildSupervisorPayload(challengeMsg, opts.userId, salt))

  const credentials: AuthCredentials = {
    type: AuthenticationType.Supervisor,
    challenge,
    credential: JSON.stringify({ salt, signature }),
    userId: opts.userId,
    role: Role.User,
    scopes: ['*']
  }

  // 3. Exchange for the intermediate auth-manager token.
  const intermediate = await postJson(fetchImpl, base + authPath, credentials) as { token: string }

  // 4. Exchange the intermediate token for the final project bearer.
  const final = await postJson(fetchImpl, base + dispatchPath, { token: intermediate.token }) as { token: string }

  return final.token
}

/**
 * Save a full-page screenshot to `<dir>/<name>.png`, creating `dir` if needed.
 * Returns the absolute file path. Use a host-backed folder (e.g. the project's
 * `tmp/tests/screenshots`) so the file is visible whether the test runs on the
 * host or inside a dev container.
 */
export const saveScreenshot = async (page: Page, dir: string, name: string): Promise<string> => {
  const target = resolve(dir)
  await mkdir(target, { recursive: true })
  const file = join(target, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

export interface SupervisorFormLoginOptions {
  baseUrl: string
  /** Target user id / email. */
  userId: string
  /** Supervisor private key (e.g. `ed25519:<base64>` from `.env.dev.secrets`). */
  pk: string
  /** Login path; defaults to the standard supervisor route. */
  path?: string
  /** Predicate/URL fragment that signals a successful landing (default: leaving the login path). */
  expectPath?: string
  timeout?: number
  /**
   * What counts as "arrived" for the initial navigation. Defaults to `domcontentloaded`.
   *
   * See the note on `MountOptions.waitUntil`: `load` is playwright's default and is wrong for a
   * real application, because it waits for every subresource — a tag manager, an analytics beacon
   * or any pixel that never settles holds it open until the navigation times out, with the login
   * form rendered and fillable the whole time.
   */
  waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle'
  /**
   * What to do about a cookie-consent dialog covering the form. Defaults to `accept`, because an
   * OwlMeans app will not start an authentication flow until consent is answered — see
   * {@link acceptConsent}. Pass `ignore` only in a spec that answers the dialog itself.
   */
  consent?: 'accept' | 'ignore'
  /** When set, capture the filled login form (`supervisor-login-form.png`) before submit. */
  screenshotDir?: string
}

const DEFAULT_SUPERVISOR_PATH = '/authentication/login/pk-supervisor'

/**
 * Answer the cookie-consent dialog if one is up, so the page underneath can be driven.
 *
 * An OwlMeans app asks for consent BEFORE it will start an authentication flow, and the dialog is
 * a modal with no dismissal — by design, since a decision is what the gate is waiting for. For a
 * test that means the login form renders, resolves, reports itself "visible, enabled and stable"
 * and still cannot be clicked, because the overlay intercepts the pointer. Playwright retries for
 * the full timeout and then blames the button, which is the most misleading failure in this file:
 * nothing is wrong with the form.
 *
 * Accepting is the honest default for a login helper — the flow it is about to drive is exactly
 * what the dialog is gating — but it is best-effort: an app without the widget, or one where the
 * visitor already decided, simply has no dialog and this returns at once.
 *
 * @returns whether a dialog was actually answered.
 */
export const acceptConsent = async (
  page: Page, opts?: { timeout?: number }
): Promise<boolean> => {
  const dialog = page.locator('[data-consent-dialog]')
  try {
    await dialog.waitFor({ state: 'visible', timeout: opts?.timeout ?? 5_000 })
  } catch {
    return false
  }
  // Accept-all rather than essential-only: a test asserting a narrower decision should make that
  // decision itself, and silently choosing the minimum here would hide it from the spec.
  await page.locator('[data-consent-accept-all]').click()
  await dialog.waitFor({ state: 'detached', timeout: opts?.timeout ?? 5_000 })

  return true
}

/**
 * Drive the PK-based supervisor login FORM end-to-end (the faithful path that
 * exercises the real supervisor plugin + registration): navigate to the
 * supervisor login route, fill the user id + private key, submit, and wait for
 * the app to leave the login screen.
 */
export const loginViaSupervisorForm = async (
  page: Page, opts: SupervisorFormLoginOptions
): Promise<void> => {
  const path = opts.path ?? DEFAULT_SUPERVISOR_PATH
  const timeout = opts.timeout ?? 60_000
  await page.goto(new URL(path, opts.baseUrl).toString(), {
    waitUntil: opts.waitUntil ?? 'domcontentloaded', timeout
  })

  // Wait for the app to MOUNT before deciding whether there is a dialog to answer. `domcontentloaded`
  // returns while the SPA is still booting, and on a dev server that boot is occasionally tens of
  // seconds — so a short consent probe reports "no dialog", the dialog then mounts over the form,
  // and the fill below waits out its own timeout on a field that is present but covered. Either
  // marker proves the app is up: the dialog, or the form itself when consent was already given.
  await page.locator('[data-consent-dialog], [data-testid="supervisor-user-id"]')
    .first().waitFor({ state: 'visible', timeout })

  if (opts.consent !== 'ignore') await acceptConsent(page, { timeout })

  // The form renders only AFTER the dialog is dismissed, so these carry the caller's budget rather
  // than playwright's 30s default — the whole point of accepting an explicit `timeout` here.
  await page.getByTestId('supervisor-user-id').fill(opts.userId, { timeout })
  await page.getByTestId('supervisor-pk').fill(opts.pk, { timeout })

  if (opts.screenshotDir != null) {
    await saveScreenshot(page, opts.screenshotDir, 'supervisor-login-form')
  }

  await page.getByTestId('supervisor-submit').click({ timeout })

  if (opts.expectPath != null) {
    await page.waitForURL(url => url.toString().includes(opts.expectPath!), { timeout })
  } else {
    await page.waitForURL(url => !url.pathname.startsWith(path), { timeout })
  }
}
