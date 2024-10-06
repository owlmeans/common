
export enum MessageType {
  Call = 'call',
  Result = 'result',
  Error = 'error',
  Request = 'request',
  Response = 'response',
  Event = 'event',
  Message = 'message',
  Auth = 'auth',
  System = 'system'
}

export const CALL_TIMEOUT = 60000
