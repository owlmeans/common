export interface RemoteConnectorOptions {
  /**
   * The HTTP deadline of every platform call but the session's own (opening, closing, the long
   * poll, a submit). `TOOL_DEADLINE_MS` when absent. It bounds one HTTP request: a delegated write
   * answered early (`{ pending }`) is collected by the context's transport, hop by hop.
   */
  timeout?: number
}
