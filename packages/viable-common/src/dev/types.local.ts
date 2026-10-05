import type { AccessBlock } from './types.js'

/** The part of an {@link AccessBlock} a model is asked for. */
export interface ModelAccessBlock extends Omit<AccessBlock, 'defaults' | 'entityScoped'> {}
