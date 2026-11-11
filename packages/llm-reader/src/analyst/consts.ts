/** Characters of page text one text-mode call reads by default. */
export const DEFAULT_PACK_BUDGET = 60_000

/** Turns the DOM agent may take by default. */
export const DEFAULT_DOM_TURNS = 12

/** Links and images listed in a reading pack, at most. */
export const PACK_LINKS = 120
export const PACK_IMAGES = 60

/** Pictures captioned by the vision model per call, and in total by default. */
export const VISION_BATCH = 4
export const DEFAULT_VISION_LIMIT = 4

/** Largest picture sent to a vision model (providers cap images around 5 MB). */
export const VISION_MAX_BYTES = 4 * 1024 * 1024

/** Media types a vision model takes. */
export const VISION_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** Roles worth a caption, most informative first. */
export const VISION_PRIORITY: readonly string[] = Object.freeze(['hero', 'illustration', 'photo', 'product', 'chart', 'screenshot', 'banner'])

export const DESCRIBE_INSTRUCTION = [
  'Describe this page for someone who has not seen it: its title, what kind of page it is, a short summary of what it',
  'is and offers, its main blocks from top to bottom, the links that matter most, and what its meaningful pictures are',
  'for. Use only what the page shows; take URLs exactly as the page links them and picture ids from the image list.',
].join(' ')

export const CLASSIFY_INSTRUCTION = [
  'Classify this page. landing = a marketing page selling one product or service; article = one story, post or',
  'report; listing = a list of items such as products, posts or results; category-index = a page whose job is to',
  'route to categories or sections; product = one product with its details; docs = reference or documentation;',
  'app = an application screen or an empty shell that needs scripts; search-results; profile = one person or',
  'organization; forum = a discussion thread; form = a page whose purpose is a form; login = sign in or sign up;',
  'error = a not-found or error page; media = a page built around one video, audio or gallery; other. Weigh the',
  'signals and the structured data, give a confidence from 0 to 1 and the features that decided it.',
].join(' ')

export const IMAGES_INSTRUCTION = [
  'For every picture in the image list, say what role it plays on this page and, in one sentence, how it is',
  'used here — judge from where it sits, what wraps it, its caption, alt text, size and the text around it.',
  'Keep the ids exactly as listed.',
].join(' ')

export const VISION_INSTRUCTION = 'Describe what each picture below shows, in one or two plain sentences, by its id. Answer as JSON.'
