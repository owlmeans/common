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
    const { surrogateLoginStep, SurrogateLoginStep } = await import('../src/login/screen.js')
    expect(surrogateLoginStep('OIDC-WRAPPED-TOKEN abc', '/dispatcher?x=1')).toBe(SurrogateLoginStep.Forget)
  })

  test('a stored session is handed back only when there is no dispatcher address', async () => {
    const { surrogateLoginStep, SurrogateLoginStep } = await import('../src/login/screen.js')
    expect(surrogateLoginStep('OIDC-WRAPPED-TOKEN abc', null)).toBe(SurrogateLoginStep.Resume)
    expect(surrogateLoginStep('OIDC-WRAPPED-TOKEN abc', '')).toBe(SurrogateLoginStep.Resume)
  })

  test('nothing stored authenticates, with or without a dispatcher address', async () => {
    const { surrogateLoginStep, SurrogateLoginStep } = await import('../src/login/screen.js')
    expect(surrogateLoginStep(null, '/dispatcher')).toBe(SurrogateLoginStep.Authenticate)
    expect(surrogateLoginStep('', null)).toBe(SurrogateLoginStep.Authenticate)
  })
})
