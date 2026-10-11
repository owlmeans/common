/** The `localStorage` key the choice lives under. */
export const COLOR_SCHEME_KEY = 'owlmeans:color-scheme'

/**
 * The event `applyColorScheme` dispatches on `window` after every change, so every mounted
 * `useColorScheme` in the document — two toggles, a header and a footer — agrees at once.
 */
export const COLOR_SCHEME_EVENT = 'owlmeans:color-scheme'
