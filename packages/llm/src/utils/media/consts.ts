/** Content-block types that stand for an image, whatever provider spells them. */
export const IMAGE_BLOCK_TYPES: ReadonlySet<string> = new Set(['image', 'image_url', 'input_image'])

/** Content-block types that carry a file — kind decided by its media type. */
export const FILE_BLOCK_TYPES: ReadonlySet<string> = new Set(['file', 'input_file'])

/** Content-block types that carry audio. */
export const AUDIO_BLOCK_TYPES: ReadonlySet<string> = new Set(['audio', 'input_audio'])

/** Anthropic document sources that are text, not a PDF — they need no document capability. */
export const TEXT_DOCUMENT_SOURCES: ReadonlySet<string> = new Set(['text', 'content'])
