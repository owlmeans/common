export interface SessionItem {
  id: string
  sessionId: string
  text: string
  createdAt: string
}

export interface AddItemPayload {
  text: string
}

export interface SessionParams {
  sid: string
}

export interface ItemParams {
  sid: string
  id: string
}
