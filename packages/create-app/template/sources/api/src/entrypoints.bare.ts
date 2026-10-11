import { entrypoints } from '@owlmeans/server-app'

// The bare shell has no API declarations yet. Bind new protocols here as they are added.
export const appBindings = [...entrypoints]
