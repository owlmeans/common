
import type { RouterProvider } from '@owlmeans/client'

/**
 * @deprecated Routing no longer needs an explicit provider. OwlMeans routing now
 * resolves the route compiler from the active router plugin
 * (`context.router().compile`) whenever `provide` is omitted. This export is kept
 * as `undefined` for source compatibility with apps that still pass it through
 * (e.g. `<PanelApp provide={provide} />`); passing `undefined` selects the default.
 */
export const provide: RouterProvider | undefined = undefined
