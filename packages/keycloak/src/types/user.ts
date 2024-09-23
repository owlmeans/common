
export interface User {
  id: string
  username: string
  enabled: boolean
  attributes?: {
    ["kc.org"]?: string[]
  }
}
