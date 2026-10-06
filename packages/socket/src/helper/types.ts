import type { AuthMessage, CallMessage, EventMessage, Message } from '../types.js'

/** Recognizes the kinds of socket message. */
export interface SocketMessageHelper {
  /** Whether a received value is a message; `nonSystem` also requires it (not) to be a system one. */
  isMessage: <P, T extends Message<P>>(msg: string | T, nonSystem?: boolean) => msg is T
  /** Whether a message is an event (system events included); `system` also requires it (not) to be a system one. */
  isEventMessage: <P>(msg: string | Message<P>, system?: boolean) => msg is EventMessage<P>
  /** Whether a message is a call. */
  isCallMessage: <P extends any[]>(msg: string | Message<unknown>) => msg is CallMessage<P>
  /** Whether a message is an authentication one. */
  isAuthMessage: <P>(msg: string | Message<P>) => msg is AuthMessage<P>
}
