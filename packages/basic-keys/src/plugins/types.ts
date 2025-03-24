
export interface KeyPlugin {
  type: string
  random: () => Uint8Array
  fromSeed?: (seed: Uint8Array) => Uint8Array
  derive?: (pk: Uint8Array, path: string) => Uint8Array
  sign: (data: Uint8Array, pk: Uint8Array) => Uint8Array
  verify: (data: Uint8Array, signature: Uint8Array, pub: Uint8Array) => boolean
  toPublic: (pk: Uint8Array) => Uint8Array
  toAdress: (pub: Uint8Array) => string
  encrypt: (data: Uint8Array, pk: Uint8Array) => Uint8Array
  decrypt: (data: Uint8Array, pk: Uint8Array) => Uint8Array
}
