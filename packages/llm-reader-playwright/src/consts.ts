/** The viewport pages are rendered and screenshot in. */
export const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 800 })

/** Navigation deadline, ms. */
export const DEFAULT_RENDER_TIMEOUT_MS = 30_000

/** How long a loaded page may keep fetching before it is read anyway, ms. */
export const DEFAULT_SETTLE_MS = 3_000

/** JPEG quality of the viewport screenshot. */
export const SCREENSHOT_QUALITY = 70

/** Elements the style probe samples, at most. */
export const PROBE_ELEMENTS = 4000
