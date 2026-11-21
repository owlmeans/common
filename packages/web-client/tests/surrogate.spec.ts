import { describe, test, expect, afterEach } from 'bun:test'
import { centeredPopupFeatures } from '../src/login/surrogate.js'

/**
 * A hand-written `window`, not jsdom: the function under test reads exactly four geometry
 * properties, and a real DOM would prove a fixture behaves rather than that the math does.
 */
const stubWindow = (over: Record<string, unknown>): void => {
  (globalThis as unknown as { window: unknown }).window = {
    screenLeft: 0, screenTop: 0, screenX: 0, screenY: 0,
    outerWidth: 1920, outerHeight: 1080,
    screen: { width: 1920, height: 1080 },
    ...over,
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('centeredPopupFeatures', () => {
  test('centers on the browser window, at its current screen position', () => {
    stubWindow({ screenLeft: 100, screenTop: 50, outerWidth: 1200, outerHeight: 800 })

    expect(centeredPopupFeatures(520, 760)).toBe('popup=yes,width=520,height=760,left=440,top=70')
  })

  // A cross-origin iframe: `window.top.innerWidth` would throw, which is exactly why this reads
  // `outerWidth`/`outerHeight` instead — they describe the browser's own chrome, not this
  // document's viewport, and stay readable across the origin boundary.
  test('falls back to screenX/screenY when the legacy aliases are unavailable', () => {
    stubWindow({
      screenLeft: undefined, screenTop: undefined, screenX: 20, screenY: 10,
      outerWidth: 1200, outerHeight: 800,
    })

    expect(centeredPopupFeatures(520, 760)).toBe('popup=yes,width=520,height=760,left=360,top=30')
  })

  test('falls back to window.screen when outerWidth/outerHeight report zero', () => {
    // A headless runner: no chrome geometry to report at all.
    stubWindow({ outerWidth: 0, outerHeight: 0, screen: { width: 1600, height: 900 } })

    expect(centeredPopupFeatures(520, 760)).toBe('popup=yes,width=520,height=760,left=540,top=70')
  })

  test('never places the popup off-screen when it is larger than the window', () => {
    stubWindow({ outerWidth: 400, outerHeight: 400 })

    expect(centeredPopupFeatures(520, 760)).toBe('popup=yes,width=520,height=760,left=0,top=0')
  })
})

describe('surrogateLoginStep', () => {
  test('a stored session is forgotten when there is a dispatcher to authenticate through', async () => {
    const { surrogateLoginStep } = await import('../src/login/screen.js')
    const { SurrogateLoginStep } = await import('../src/login/consts.js')
    expect(surrogateLoginStep('OIDC-WRAPPED-TOKEN abc', '/dispatcher?x=1')).toBe(SurrogateLoginStep.Forget)
  })

  test('a stored session is handed back only when there is no dispatcher address', async () => {
    const { surrogateLoginStep } = await import('../src/login/screen.js')
    const { SurrogateLoginStep } = await import('../src/login/consts.js')
    expect(surrogateLoginStep('OIDC-WRAPPED-TOKEN abc', null)).toBe(SurrogateLoginStep.Resume)
    expect(surrogateLoginStep('OIDC-WRAPPED-TOKEN abc', '')).toBe(SurrogateLoginStep.Resume)
  })

  test('nothing stored authenticates, with or without a dispatcher address', async () => {
    const { surrogateLoginStep } = await import('../src/login/screen.js')
    const { SurrogateLoginStep } = await import('../src/login/consts.js')
    expect(surrogateLoginStep(null, '/dispatcher')).toBe(SurrogateLoginStep.Authenticate)
    expect(surrogateLoginStep('', null)).toBe(SurrogateLoginStep.Authenticate)
  })
})

describe('the surrogate window of an application served under a base', () => {
  const env = { hasWindow: true, embedded: true, surrogate: false, hasOpener: false }

  /** A browser application's context whose own frontend service carries `base`, the surrogate bound. */
  const contextWith = async (base?: string) => {
    const { AppType, makeBasicContext } = await import('@owlmeans/context')
    const { authProtocols } = await import('@owlmeans/auth-common')
    const { bindScreen, stab } = await import('@owlmeans/client-entrypoint')
    const context = makeBasicContext({
      ready: false, service: 'web-client-tests', type: AppType.Frontend,
      services: {
        'web-client-tests': { service: 'web-client-tests', type: AppType.Frontend, host: 'example.com', ...(base != null ? { base } : {}) },
      },
    })
    context.registerEntrypoint(bindScreen(authProtocols.surrogate, stab))

    return context
  }

  /** Begin a sign-in from a framed document whose `window.open` the browser refuses; returns what it tried to open. */
  const openedFor = async (base: string | undefined, url: string): Promise<{ opened: string[], outcome: string }> => {
    const opened: string[] = []
    stubWindow({ open: (address: string) => { opened.push(address); return null } })
    const { makeSurrogateLoginPlugin } = await import('../src/login/surrogate.js')
    const ctx = await contextWith(base)
    const outcome = await makeSurrogateLoginPlugin().begin(ctx as never, { url }, env)

    return { opened, outcome }
  }

  test('the window opens on the surrogate route under the base; the dispatcher address rides as next', async () => {
    const { LoginOutcome } = await import('@owlmeans/client-auth/login')
    // `/app/dispatcher` is what `useLogin` hands over for an application served under `/app`.
    expect(await openedFor('/app', '/app/dispatcher'))
      .toEqual({ opened: ['/app/surrogate?intent=login&next=%2Fapp%2Fdispatcher'], outcome: LoginOutcome.Blocked })
  })

  test('at the root the window opens exactly where it always did', async () => {
    for (const base of [undefined, '', '/']) {
      expect((await openedFor(base, '/dispatcher')).opened).toEqual(['/surrogate?intent=login&next=%2Fdispatcher'])
    }
  })
})
