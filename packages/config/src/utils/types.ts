
export type TreeKey = string | number | symbol
export type TreeValue = unknown | Array<unknown> | string
export interface Tree extends Record<TreeKey, TreeValue | Tree> { }
