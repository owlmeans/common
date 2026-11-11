/** How `collectDroppedFiles` walks a drop. */
export interface CollectOptions {
  /** Names skipped; a folder of that name is not entered. Default `DEFAULT_UPLOAD_IGNORE`. */
  ignore?: readonly string[]
  /** Files collected at most. Default `DEFAULT_COLLECT_LIMIT`. */
  limit?: number
}
