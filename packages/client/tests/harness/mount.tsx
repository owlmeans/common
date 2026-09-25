import { Component } from 'react'
import type { FC, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { lazyComponent } from '../../src/index.js'

/*
 * One lazily-loaded piece per page, picked by `?component=`, beside a sibling and under a
 * boundary that stands for the application's own. Counters are module state, so they start over
 * with every document; `harness:boots` in sessionStorage counts the documents a tab went through.
 */

const boots = Number(sessionStorage.getItem('harness:boots') ?? 0) + 1
sessionStorage.setItem('harness:boots', String(boots))

const loads = { count: 0 }
;(window as unknown as { __loads: typeof loads }).__loads = loads

type PieceModule = typeof import('./piece.js')

/** What Chromium rejects a dynamic import with when the module could not be fetched. */
const chunkFailure = () => new TypeError(`Failed to fetch dynamically imported module: ${location.origin}/piece.tsx`)

/** A load whose first `failures` runs fail to fetch; the next one imports the piece. */
const failing = (failures: number) => async (): Promise<PieceModule> => {
  if (++loads.count <= failures) {
    throw chunkFailure()
  }
  return import('./piece.js')
}

/** Trips only when an error escapes the lazy piece — the whole page is replaced when it does. */
class AppBoundary extends Component<{ children: ReactNode }, { error?: unknown }> {
  override state: { error?: unknown } = {}

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  override render() {
    return this.state.error !== undefined
      ? <div id="app-tripped">{(this.state.error as Error).message}</div>
      : this.props.children
  }
}

// Short pauses: the retry schedule is `retryImport`'s own concern, covered without a browser.
// These cases model a loader that fails N times, so they repeat it as is (`bustCache: false`);
// `busted` below is the one that lets a retry fetch the failed chunk from a new URL.
const FAST = { delaysMs: [10], bustCache: false }

// Module scope, as `lazyComponent` requires.
const Recovers = lazyComponent(failing(2), 'Piece', { retry: FAST, fallback: <span id="fallback">loading</span> })
const NoSurface = lazyComponent(failing(Infinity), 'Piece', { retry: FAST, fallback: <span id="fallback">plain</span> })
const Broken = lazyComponent(async (): Promise<PieceModule> => {
  loads.count++
  throw new Error('module evaluation failed')
}, 'Piece', { retry: FAST })
const Retryable = lazyComponent(failing(3), 'Piece', {
  retry: FAST,
  error: (_props, error, retry) => <button id="retry" data-error={(error as Error).message} onClick={retry}>again</button>,
})

// Every run of its own loader fails, as a browser that remembers a failed fetch would: only the
// cache-busted import of the URL the error names (`/piece.tsx?t=…`) reaches the module.
const Busted = lazyComponent(failing(Infinity), 'Piece', { retry: { delaysMs: [10] } })

// A whole screen: a chunk that failed for good reloads the page once, then shows its surface.
const Screen = lazyComponent(failing(Infinity), 'Piece', {
  retry: FAST, reload: true, fallback: <span id="fallback">loading</span>, error: <div id="notice">notice</div>,
})

const cases: Record<string, FC> = {
  busted: () => <Busted label="busted" />,
  screen: () => <Screen label="screen" />,
  recovers: () => <Recovers label="recovers" />,
  'no-surface': () => <NoSurface label="no-surface" />,
  broken: () => <Broken label="broken" />,
  retryable: () => <Retryable label="retryable" />,
}

const Case = cases[new URLSearchParams(location.search).get('component') ?? ''] ?? (() => <div id="no-case" />)

createRoot(document.getElementById('root')!).render(<AppBoundary>
  <div id="sibling">sibling</div>
  <Case />
</AppBoundary>)
