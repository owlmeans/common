/** Close codes that mean "this connection is finished on purpose" — never worth retrying: a
 *  normal closure the SERVER initiated (1000, e.g. the protocol's own one-shot completion) and a
 *  policy violation (1008, e.g. the guard rejected the frame that opened it). A client-initiated
 *  close is handled separately, through `closedByClient`. */
export const TERMINAL_CLOSE_CODES: ReadonlySet<number> = new Set([1000, 1008])
