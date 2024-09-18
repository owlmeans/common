
export interface ParamsFromToken {
  realm: string
  [key: string]: string
}

export interface HeadersFromToken {
  Authorization: string
  [key: string]: string
}

export interface TokenRequest {
  params: ParamsFromToken
  headers: HeadersFromToken
}
